// ============================================================
// AI International Growth Engine - Country Strategy Agent (Agent 2)
// Defines brand positioning, cultural tone, price sensitivity,
// messaging style, and preferred platform mix per country.
// Outputs strategic blueprints for international market entry.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  AgentConfig,
} from '../base/types';
import type { AgentType, Country, Platform } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { NotFoundError, DatabaseError } from '../../utils/errors';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Brand positioning strategy for a specific country market.
 */
export interface BrandPositioning {
  /** Core positioning statement for the market */
  positioning: string;
  /** Key differentiators that set the brand apart in this market */
  differentiators: string[];
  /** The primary value proposition tailored to local consumers */
  valueProposition: string;
  /** How the brand gains competitive advantage in this market */
  competitiveAdvantage: string;
}

/**
 * Cultural tone profile that guides communication in a country.
 */
export interface CulturalToneProfile {
  /** Level of formality expected in brand communications */
  formality: 'formal' | 'casual' | 'mixed';
  /** Whether humor is appropriate in marketing materials */
  humor: boolean;
  /** Directness level of messaging style */
  directness: 'direct' | 'indirect';
  /** Primary emotional appeal for the market */
  emotionalAppeal: string;
  /** Culturally preferred colors for branding and creative */
  colorPreferences: string[];
  /** Cultural taboos to avoid in messaging and imagery */
  taboos: string[];
}

/**
 * Sensitivity of the market to pricing strategies.
 */
export type PriceSensitivityLevel = 'very_high' | 'high' | 'medium' | 'low';

/**
 * Messaging style recommendations for a country market.
 */
export interface MessagingStyle {
  /** Primary messaging approach */
  primary: string;
  /** Secondary messaging approach */
  secondary: string;
  /** Recommended call-to-action style */
  callToAction: string;
  /** Phrases and patterns to avoid in this market */
  avoidPhrases: string[];
}

/**
 * Platform allocation recommendation with weight and strategy per platform.
 */
export interface PlatformMixRecommendation {
  /** Platform-specific weight (0-1 allocation share) and strategy */
  platforms: Record<Platform, { weight: number; strategy: string }>;
}

/**
 * Strategic timeline with phased rollout plan.
 */
export interface StrategyTimeline {
  /** Ordered phases for market entry and growth */
  phases: Array<{
    name: string;
    duration: string;
    actions: string[];
  }>;
}

/**
 * Complete strategic blueprint for a country market.
 */
export interface StrategyBlueprint {
  /** Internal country identifier */
  countryId: string;
  /** ISO country code */
  countryCode: string;
  /** Brand positioning strategy */
  brandPositioning: BrandPositioning;
  /** Cultural tone profile */
  culturalTone: CulturalToneProfile;
  /** Price sensitivity assessment */
  priceSensitivity: PriceSensitivityLevel;
  /** Messaging style recommendations */
  messagingStyle: MessagingStyle;
  /** Platform mix recommendations */
  platformMix: PlatformMixRecommendation;
  /** Phased strategy timeline */
  timeline: StrategyTimeline;
  /** Identified market risks */
  risks: string[];
  /** Identified market opportunities */
  opportunities: string[];
  /** Confidence assessment for the overall blueprint */
  confidence: AgentConfidenceScore;
}

// ============================================================
// Cache configuration
// ============================================================

const CACHE_PREFIX = 'country_strategy';
const CACHE_TTL_SECONDS = 3600; // 1 hour

// ============================================================
// CountryStrategyAgent
// ============================================================

/**
 * Agent 2 - Country Strategy Agent
 *
 * Analyzes country-level data to produce comprehensive strategic blueprints
 * that guide brand positioning, cultural tone, pricing, messaging, and
 * platform allocation for international market entry and growth.
 *
 * Data-driven: all outputs derived from DB-sourced country data and AI analysis.
 */
export class CountryStrategyAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'country_strategy' as AgentType,
      model: 'opus',
      maxRetries: 3,
      timeoutMs: 120_000,
      confidenceThreshold: 65,
      ...config,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the peer agent types this agent can challenge.
   */
  getChallengeTargets(): AgentType[] {
    return ['market_intelligence', 'localization', 'compliance'];
  }

  /**
   * Returns the Claude system prompt defining this agent's AI persona.
   */
  getSystemPrompt(): string {
    return `You are the Country Strategy Agent, an expert in international market strategy and brand positioning.

Your role is to analyze country-level market data and generate comprehensive strategic blueprints for international expansion.

You specialize in:
- Brand positioning tailored to local market dynamics
- Cultural tone analysis and communication style adaptation
- Price sensitivity assessment based on economic indicators
- Messaging style that resonates with local audiences
- Platform mix optimization based on regional platform adoption
- Phased market entry timeline planning

When generating strategies, you MUST:
1. Base all recommendations on the provided market data (GDP, internet penetration, e-commerce adoption, social platform usage, ad costs, cultural behavior).
2. Consider regional and cultural nuances in every recommendation.
3. Identify risks and opportunities specific to the market.
4. Provide actionable, phased timelines for market entry.
5. Flag any areas where data is insufficient for high-confidence recommendations.

Response format: Return a valid JSON object with the following structure:
{
  "brandPositioning": {
    "positioning": "string",
    "differentiators": ["string"],
    "valueProposition": "string",
    "competitiveAdvantage": "string"
  },
  "culturalTone": {
    "formality": "formal|casual|mixed",
    "humor": boolean,
    "directness": "direct|indirect",
    "emotionalAppeal": "string",
    "colorPreferences": ["string"],
    "taboos": ["string"]
  },
  "priceSensitivity": "very_high|high|medium|low",
  "messagingStyle": {
    "primary": "string",
    "secondary": "string",
    "callToAction": "string",
    "avoidPhrases": ["string"]
  },
  "platformMix": {
    "platforms": {
      "platform_name": { "weight": number, "strategy": "string" }
    }
  },
  "timeline": {
    "phases": [{ "name": "string", "duration": "string", "actions": ["string"] }]
  },
  "risks": ["string"],
  "opportunities": ["string"]
}`;
  }

  /**
   * Core processing method. Receives an agent input, fetches country data,
   * generates a strategic blueprint, and returns a standardized AgentOutput.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    const countryId = input.parameters.countryId as string | undefined;
    const uncertainties: string[] = [];
    const warnings: string[] = [];

    this.log.info('Processing country strategy request', {
      requestId: input.requestId,
      countryId,
    });

    if (!countryId) {
      return this.buildOutput(
        'country_strategy_failed',
        {},
        this.calculateConfidence({ dataCompleteness: 0 }),
        'No countryId provided in parameters.',
        [],
        ['Missing required parameter: countryId'],
        [],
      );
    }

    try {
      const blueprint = await this.generateBlueprint(countryId);

      const validation = this.validateStrategy(blueprint);
      if (!validation.valid) {
        warnings.push(...validation.issues.map((issue) => `Validation: ${issue}`));
      }

      const output = this.buildOutput(
        'country_strategy_generated',
        blueprint as unknown as Record<string, unknown>,
        blueprint.confidence,
        `Strategic blueprint generated for country ${blueprint.countryCode}. ` +
          `Brand positioned as "${blueprint.brandPositioning.positioning}" with ` +
          `${blueprint.priceSensitivity} price sensitivity and ` +
          `${blueprint.culturalTone.formality} cultural tone.`,
        [
          `Prioritize ${this.getTopPlatform(blueprint.platformMix)} for initial campaign launch`,
          `Adopt ${blueprint.culturalTone.formality} tone in all marketing communications`,
          `Plan for ${blueprint.timeline.phases.length}-phase market entry`,
        ],
        warnings,
        blueprint.confidence.level === 'low'
          ? [
              this.flagUncertainty(
                'data_quality',
                'Low confidence in blueprint - review underlying data sources',
              ),
            ]
          : [],
      );

      await this.logDecision(input, output);
      await this.persistState({
        lastBlueprintCountryId: countryId,
        lastBlueprintConfidence: blueprint.confidence.score,
        generatedAt: new Date().toISOString(),
      });

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Country strategy processing failed', {
        requestId: input.requestId,
        countryId,
        error: message,
      });

      return this.buildOutput(
        'country_strategy_failed',
        { error: message },
        this.calculateConfidence({ dataCompleteness: 0, analysisQuality: 0 }),
        `Failed to generate strategy for country ${countryId}: ${message}`,
        [],
        [`Strategy generation failed: ${message}`],
        [this.flagUncertainty('processing', message)],
      );
    }
  }

  // ------------------------------------------------------------------
  // Blueprint generation
  // ------------------------------------------------------------------

  /**
   * Generates a complete strategic blueprint for the given country.
   * Fetches country data from DB, runs cultural and pricing analysis,
   * calls AI for strategic positioning, and assembles the full blueprint.
   */
  async generateBlueprint(countryId: string): Promise<StrategyBlueprint> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:blueprint:${countryId}`;
    const cached = await cacheGet<StrategyBlueprint>(cacheKey);
    if (cached) {
      this.log.info('Returning cached blueprint', { countryId });
      return cached;
    }

    // Fetch country data from DB
    const country = await this.fetchCountryData(countryId);
    const marketData = await this.fetchMarketData(countryId);
    const competitorData = await this.fetchCompetitorData(countryId);

    // Analyze cultural and pricing dimensions
    const culturalTone = this.analyzeCulturalTone(country);
    const priceSensitivity = this.assessPriceSensitivity(country);
    const platformMix = this.recommendPlatformMix(country);

    // Generate AI-driven positioning and messaging
    const brandPositioning = await this.determineBrandPositioning(country, marketData);
    const messagingStyle = await this.determineMessagingStyle(country, brandPositioning);

    // Assess risks and opportunities
    const { risks, opportunities } = this.assessRisksAndOpportunities(
      country,
      marketData,
      competitorData,
    );

    // Calculate confidence based on data completeness
    const confidence = this.calculateBlueprintConfidence(country, marketData);

    // Assemble the blueprint
    const blueprint: StrategyBlueprint = {
      countryId: country.id,
      countryCode: country.code,
      brandPositioning,
      culturalTone,
      priceSensitivity,
      messagingStyle,
      platformMix,
      timeline: { phases: [] }, // placeholder, populated by generateTimeline
      risks,
      opportunities,
      confidence,
    };

    // Generate phased timeline based on the assembled blueprint
    blueprint.timeline = this.generateTimeline(blueprint);

    // Cache the result
    await cacheSet(cacheKey, blueprint, CACHE_TTL_SECONDS);

    this.log.info('Blueprint generated', {
      countryId,
      countryCode: country.code,
      confidence: confidence.score,
    });

    return blueprint;
  }

  // ------------------------------------------------------------------
  // Brand positioning
  // ------------------------------------------------------------------

  /**
   * Determines brand positioning strategy by combining country data
   * with market intelligence and AI-generated strategic insights.
   */
  async determineBrandPositioning(
    country: Country,
    marketData: MarketDataSummary,
  ): Promise<BrandPositioning> {
    const userPrompt = `Analyze the following country data and generate a brand positioning strategy.

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
Active Campaigns: ${marketData.activeCampaignCount}
Average ROAS: ${marketData.averageRoas ?? 'No data'}
Total Market Spend: ${marketData.totalMarketSpend ?? 'No data'}
Competitor Count: ${marketData.competitorCount}

Return ONLY a JSON object with this structure:
{
  "positioning": "core positioning statement",
  "differentiators": ["diff1", "diff2", "diff3"],
  "valueProposition": "value proposition statement",
  "competitiveAdvantage": "competitive advantage description"
}`;

    try {
      const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
      const parsed = this.parseAIJson<BrandPositioning>(aiResponse);

      if (
        parsed &&
        parsed.positioning &&
        Array.isArray(parsed.differentiators) &&
        parsed.valueProposition &&
        parsed.competitiveAdvantage
      ) {
        return parsed;
      }
    } catch (error) {
      this.log.warn('AI brand positioning generation failed, using data-driven fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Data-driven fallback when AI is unavailable
    return this.buildFallbackPositioning(country, marketData);
  }

  // ------------------------------------------------------------------
  // Cultural tone analysis
  // ------------------------------------------------------------------

  /**
   * Analyzes cultural behavior data from the country record
   * to derive a cultural tone profile for marketing communications.
   */
  analyzeCulturalTone(country: Country): CulturalToneProfile {
    const behavior = country.cultural_behavior ?? {};
    const region = country.region.toLowerCase();

    // Derive formality from cultural behavior data or regional defaults
    const formalityRaw = behavior.formality ?? behavior.communication_style ?? '';
    let formality: CulturalToneProfile['formality'] = 'mixed';
    if (formalityRaw === 'formal' || formalityRaw === 'casual') {
      formality = formalityRaw;
    } else if (
      region.includes('east asia') ||
      region.includes('middle east') ||
      region.includes('south asia')
    ) {
      formality = 'formal';
    } else if (
      region.includes('north america') ||
      region.includes('oceania') ||
      region.includes('latin america')
    ) {
      formality = 'casual';
    }

    // Derive humor appropriateness
    const humorRaw = behavior.humor ?? behavior.humor_appropriateness ?? '';
    const humor =
      humorRaw === 'true' || humorRaw === 'yes' || humorRaw === 'appropriate'
        ? true
        : humorRaw === 'false' || humorRaw === 'no' || humorRaw === 'inappropriate'
          ? false
          : region.includes('north america') ||
            region.includes('oceania') ||
            region.includes('western europe');

    // Derive directness
    const directnessRaw = behavior.directness ?? behavior.communication_directness ?? '';
    let directness: CulturalToneProfile['directness'] = 'direct';
    if (directnessRaw === 'indirect') {
      directness = 'indirect';
    } else if (
      directnessRaw !== 'direct' &&
      (region.includes('east asia') ||
        region.includes('southeast asia') ||
        region.includes('south asia') ||
        region.includes('middle east'))
    ) {
      directness = 'indirect';
    }

    // Derive emotional appeal
    const emotionalAppeal =
      behavior.emotional_appeal ??
      behavior.appeal_type ??
      this.deriveEmotionalAppeal(region);

    // Derive color preferences from cultural data
    const colorPreferencesRaw = behavior.color_preferences ?? behavior.preferred_colors ?? '';
    const colorPreferences = colorPreferencesRaw
      ? String(colorPreferencesRaw)
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : this.deriveDefaultColors(region);

    // Derive taboos
    const taboosRaw = behavior.taboos ?? behavior.cultural_taboos ?? '';
    const taboos = taboosRaw
      ? String(taboosRaw)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    return {
      formality,
      humor,
      directness,
      emotionalAppeal,
      colorPreferences,
      taboos,
    };
  }

  // ------------------------------------------------------------------
  // Price sensitivity assessment
  // ------------------------------------------------------------------

  /**
   * Assesses price sensitivity based on GDP, e-commerce adoption,
   * and ad cost levels from the country data.
   */
  assessPriceSensitivity(country: Country): PriceSensitivityLevel {
    const gdp = country.gdp;
    const ecommerceAdoption = country.ecommerce_adoption;
    const adCosts = country.ad_costs ?? {};

    // If no economic data available, cannot determine
    if (gdp === undefined && ecommerceAdoption === undefined) {
      return 'medium'; // conservative default when no data
    }

    let sensitivityScore = 50; // Start at medium baseline

    // GDP factor: lower GDP implies higher price sensitivity
    if (gdp !== undefined) {
      if (gdp < 5_000) {
        sensitivityScore += 30;
      } else if (gdp < 15_000) {
        sensitivityScore += 15;
      } else if (gdp < 40_000) {
        sensitivityScore -= 5;
      } else {
        sensitivityScore -= 20;
      }
    }

    // E-commerce adoption factor: higher adoption often correlates with
    // price comparison behavior, which can increase sensitivity
    if (ecommerceAdoption !== undefined) {
      if (ecommerceAdoption < 20) {
        sensitivityScore += 10;
      } else if (ecommerceAdoption > 70) {
        sensitivityScore -= 5;
      }
    }

    // Ad cost factor: low ad costs may suggest emerging market with
    // higher price sensitivity
    const avgAdCost = this.calculateAverageAdCost(adCosts);
    if (avgAdCost !== null) {
      if (avgAdCost < 0.5) {
        sensitivityScore += 10;
      } else if (avgAdCost > 3.0) {
        sensitivityScore -= 10;
      }
    }

    // Map score to sensitivity level
    if (sensitivityScore >= 75) return 'very_high';
    if (sensitivityScore >= 55) return 'high';
    if (sensitivityScore >= 35) return 'medium';
    return 'low';
  }

  // ------------------------------------------------------------------
  // Messaging style
  // ------------------------------------------------------------------

  /**
   * Determines the messaging style based on country characteristics
   * and the brand positioning strategy. Uses AI for nuanced analysis
   * with data-driven fallback.
   */
  async determineMessagingStyle(
    country: Country,
    positioning: BrandPositioning,
  ): Promise<MessagingStyle> {
    const userPrompt = `Based on the following brand positioning and country context, determine the optimal messaging style.

Country: ${country.name} (${country.code})
Region: ${country.region}
Language: ${country.language}
Cultural Behavior: ${JSON.stringify(country.cultural_behavior ?? {})}

Brand Positioning: ${positioning.positioning}
Value Proposition: ${positioning.valueProposition}
Differentiators: ${positioning.differentiators.join(', ')}

Return ONLY a JSON object with this structure:
{
  "primary": "primary messaging approach description",
  "secondary": "secondary messaging approach description",
  "callToAction": "recommended CTA style",
  "avoidPhrases": ["phrase1", "phrase2"]
}`;

    try {
      const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
      const parsed = this.parseAIJson<MessagingStyle>(aiResponse);

      if (
        parsed &&
        parsed.primary &&
        parsed.secondary &&
        parsed.callToAction &&
        Array.isArray(parsed.avoidPhrases)
      ) {
        return parsed;
      }
    } catch (error) {
      this.log.warn('AI messaging style generation failed, using data-driven fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Data-driven fallback
    return this.buildFallbackMessagingStyle(country, positioning);
  }

  // ------------------------------------------------------------------
  // Platform mix recommendation
  // ------------------------------------------------------------------

  /**
   * Recommends platform allocation weights and strategies based on
   * social platform penetration data and ad cost structure.
   */
  recommendPlatformMix(country: Country): PlatformMixRecommendation {
    const socialPlatforms = country.social_platforms ?? {};
    const adCosts = country.ad_costs ?? {};
    const allPlatforms: Platform[] = ['google', 'bing', 'meta', 'tiktok', 'snapchat'];

    const platformEntries: Record<Platform, { weight: number; strategy: string }> = {} as Record<
      Platform,
      { weight: number; strategy: string }
    >;

    // Calculate raw weights from social platform data
    let totalWeight = 0;
    const rawWeights: Record<string, number> = {};

    for (const platform of allPlatforms) {
      const penetration = this.getPlatformPenetration(platform, socialPlatforms);
      const costEfficiency = this.getPlatformCostEfficiency(platform, adCosts);

      // Weight is a combination of penetration and cost efficiency
      // Penetration drives 70% of the weight, cost efficiency drives 30%
      const raw = penetration * 0.7 + costEfficiency * 0.3;
      rawWeights[platform] = raw;
      totalWeight += raw;
    }

    // Normalize weights to sum to 1.0 and assign strategies
    for (const platform of allPlatforms) {
      const normalizedWeight =
        totalWeight > 0
          ? Math.round((rawWeights[platform] / totalWeight) * 100) / 100
          : 1 / allPlatforms.length;

      platformEntries[platform] = {
        weight: normalizedWeight,
        strategy: this.derivePlatformStrategy(
          platform,
          normalizedWeight,
          country,
        ),
      };
    }

    // Ensure weights sum to 1.0 (adjust largest to compensate rounding)
    const currentSum = Object.values(platformEntries).reduce((s, e) => s + e.weight, 0);
    if (currentSum !== 1.0 && allPlatforms.length > 0) {
      const diff = Math.round((1.0 - currentSum) * 100) / 100;
      const topPlatform = allPlatforms.reduce((a, b) =>
        platformEntries[a].weight >= platformEntries[b].weight ? a : b,
      );
      platformEntries[topPlatform].weight =
        Math.round((platformEntries[topPlatform].weight + diff) * 100) / 100;
    }

    return { platforms: platformEntries };
  }

  // ------------------------------------------------------------------
  // Timeline generation
  // ------------------------------------------------------------------

  /**
   * Generates a phased strategy timeline based on the assembled blueprint.
   * Timeline phases adapt based on market complexity and price sensitivity.
   */
  generateTimeline(blueprint: StrategyBlueprint): StrategyTimeline {
    const phases: StrategyTimeline['phases'] = [];

    // Phase 1: Market Research & Preparation
    phases.push({
      name: 'Market Research & Preparation',
      duration: blueprint.priceSensitivity === 'very_high' ? '6 weeks' : '4 weeks',
      actions: [
        `Validate brand positioning: "${blueprint.brandPositioning.positioning}"`,
        `Conduct local focus groups to verify cultural tone (${blueprint.culturalTone.formality})`,
        'Set up analytics and tracking infrastructure',
        'Prepare localized creative assets',
        `Review and address ${blueprint.risks.length} identified market risks`,
      ],
    });

    // Phase 2: Soft Launch
    const topPlatform = this.getTopPlatform(blueprint.platformMix);
    phases.push({
      name: 'Soft Launch',
      duration: blueprint.culturalTone.formality === 'formal' ? '4 weeks' : '3 weeks',
      actions: [
        `Launch initial campaigns on ${topPlatform} (highest weighted platform)`,
        `Deploy ${blueprint.culturalTone.formality} tone messaging across all channels`,
        'A/B test core value proposition messaging',
        `Monitor price sensitivity indicators (level: ${blueprint.priceSensitivity})`,
        'Collect initial performance data for optimization',
      ],
    });

    // Phase 3: Scale & Optimize
    const platformCount = Object.entries(blueprint.platformMix.platforms).filter(
      ([, v]) => v.weight > 0.1,
    ).length;
    phases.push({
      name: 'Scale & Optimize',
      duration: '6 weeks',
      actions: [
        `Expand to ${platformCount} platforms based on platform mix recommendations`,
        'Optimize campaigns based on initial performance data',
        `Capitalize on ${blueprint.opportunities.length} identified opportunities`,
        'Refine audience targeting based on engagement patterns',
        'Scale budget allocation towards top-performing channels',
      ],
    });

    // Phase 4: Full Market Penetration
    phases.push({
      name: 'Full Market Penetration',
      duration: 'Ongoing',
      actions: [
        'Activate full platform mix at recommended weights',
        'Launch loyalty and retention campaigns',
        'Implement competitive monitoring and response strategies',
        'Conduct quarterly strategy review and blueprint refresh',
        'Expand into adjacent audience segments',
      ],
    });

    return { phases };
  }

  // ------------------------------------------------------------------
  // Strategy validation
  // ------------------------------------------------------------------

  /**
   * Validates a strategy blueprint for completeness and consistency.
   * Returns validation status and a list of specific issues found.
   */
  validateStrategy(blueprint: StrategyBlueprint): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Validate brand positioning
    if (!blueprint.brandPositioning.positioning) {
      issues.push('Brand positioning statement is empty');
    }
    if (
      !blueprint.brandPositioning.differentiators ||
      blueprint.brandPositioning.differentiators.length === 0
    ) {
      issues.push('No brand differentiators defined');
    }
    if (!blueprint.brandPositioning.valueProposition) {
      issues.push('Value proposition is empty');
    }

    // Validate platform mix weights
    const totalWeight = Object.values(blueprint.platformMix.platforms).reduce(
      (sum, p) => sum + p.weight,
      0,
    );
    if (Math.abs(totalWeight - 1.0) > 0.05) {
      issues.push(
        `Platform mix weights sum to ${totalWeight.toFixed(2)}, expected ~1.0`,
      );
    }

    // Validate each platform has a strategy
    for (const [platform, config] of Object.entries(blueprint.platformMix.platforms)) {
      if (!config.strategy) {
        issues.push(`Platform ${platform} is missing a strategy description`);
      }
      if (config.weight < 0 || config.weight > 1) {
        issues.push(`Platform ${platform} weight ${config.weight} is out of range [0, 1]`);
      }
    }

    // Validate timeline
    if (blueprint.timeline.phases.length === 0) {
      issues.push('Strategy timeline has no phases defined');
    }
    for (const phase of blueprint.timeline.phases) {
      if (!phase.name) {
        issues.push('Timeline phase missing name');
      }
      if (!phase.duration) {
        issues.push(`Timeline phase "${phase.name}" missing duration`);
      }
      if (!phase.actions || phase.actions.length === 0) {
        issues.push(`Timeline phase "${phase.name}" has no actions`);
      }
    }

    // Validate cultural tone
    if (!blueprint.culturalTone.emotionalAppeal) {
      issues.push('Cultural tone is missing emotional appeal definition');
    }

    // Validate confidence
    if (blueprint.confidence.score < 0 || blueprint.confidence.score > 100) {
      issues.push(`Confidence score ${blueprint.confidence.score} is out of range [0, 100]`);
    }

    // Validate messaging style
    if (!blueprint.messagingStyle.primary) {
      issues.push('Primary messaging style is empty');
    }
    if (!blueprint.messagingStyle.callToAction) {
      issues.push('Call-to-action style is empty');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // ------------------------------------------------------------------
  // Data fetching (private)
  // ------------------------------------------------------------------

  /**
   * Fetches the country record from the database by ID.
   */
  private async fetchCountryData(countryId: string): Promise<Country> {
    try {
      const result = await pool.query<Country>(
        'SELECT * FROM countries WHERE id = $1 AND is_active = true',
        [countryId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Country not found: ${countryId}`);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(`Failed to fetch country data: ${message}`);
    }
  }

  /**
   * Fetches aggregated market data (campaigns, spend, ROAS) for a country.
   */
  private async fetchMarketData(countryId: string): Promise<MarketDataSummary> {
    try {
      const campaignResult = await pool.query(
        `SELECT
           COUNT(*) as campaign_count,
           COUNT(*) FILTER (WHERE status = 'active') as active_count,
           COALESCE(SUM(budget), 0) as total_budget,
           COALESCE(SUM(spent), 0) as total_spent,
           COALESCE(AVG((metrics->>'roas')::numeric), 0) as avg_roas
         FROM campaigns
         WHERE country_id = $1`,
        [countryId],
      );

      const row = campaignResult.rows[0] ?? {};

      return {
        totalCampaignCount: parseInt(row.campaign_count ?? '0', 10),
        activeCampaignCount: parseInt(row.active_count ?? '0', 10),
        totalBudget: parseFloat(row.total_budget ?? '0'),
        totalMarketSpend: parseFloat(row.total_spent ?? '0'),
        averageRoas: parseFloat(row.avg_roas ?? '0'),
        competitorCount: 0, // populated below
      };
    } catch (error) {
      this.log.warn('Failed to fetch market data, using empty defaults', {
        countryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalCampaignCount: 0,
        activeCampaignCount: 0,
        totalBudget: 0,
        totalMarketSpend: 0,
        averageRoas: 0,
        competitorCount: 0,
      };
    }
  }

  /**
   * Fetches competitor count and basic competitive intelligence for a country.
   */
  private async fetchCompetitorData(countryId: string): Promise<CompetitorSummary> {
    try {
      const result = await pool.query(
        `SELECT
           COUNT(*) as competitor_count,
           COALESCE(AVG((metrics->>'estimated_spend')::numeric), 0) as avg_spend,
           COALESCE(AVG((metrics->>'market_share')::numeric), 0) as avg_share
         FROM competitors c
         INNER JOIN campaigns camp ON camp.country_id = $1
         WHERE c.last_analyzed_at IS NOT NULL
         LIMIT 1`,
        [countryId],
      );

      const row = result.rows[0] ?? {};

      return {
        count: parseInt(row.competitor_count ?? '0', 10),
        averageSpend: parseFloat(row.avg_spend ?? '0'),
        averageMarketShare: parseFloat(row.avg_share ?? '0'),
      };
    } catch (error) {
      this.log.warn('Failed to fetch competitor data, using empty defaults', {
        countryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        count: 0,
        averageSpend: 0,
        averageMarketShare: 0,
      };
    }
  }

  // ------------------------------------------------------------------
  // Confidence calculation
  // ------------------------------------------------------------------

  /**
   * Calculates confidence for a blueprint based on data completeness
   * and quality of the underlying country and market data.
   */
  private calculateBlueprintConfidence(
    country: Country,
    marketData: MarketDataSummary,
  ): AgentConfidenceScore {
    const factors: Record<string, number> = {};

    // Data completeness factor
    let dataPoints = 0;
    let availablePoints = 0;
    const checkField = (value: unknown) => {
      availablePoints++;
      if (value !== undefined && value !== null) dataPoints++;
    };

    checkField(country.gdp);
    checkField(country.internet_penetration);
    checkField(country.ecommerce_adoption);
    checkField(country.social_platforms);
    checkField(country.ad_costs);
    checkField(country.cultural_behavior);

    factors.dataCompleteness = availablePoints > 0 ? (dataPoints / availablePoints) * 100 : 0;

    // Market data richness
    factors.marketDataRichness =
      marketData.totalCampaignCount > 0
        ? Math.min(100, marketData.activeCampaignCount * 20 + 20)
        : 10;

    // Cultural data depth
    const behaviorEntries = Object.keys(country.cultural_behavior ?? {}).length;
    factors.culturalDataDepth = Math.min(100, behaviorEntries * 15 + 10);

    // Platform data quality
    const platformEntries = Object.keys(country.social_platforms ?? {}).length;
    factors.platformDataQuality = Math.min(100, platformEntries * 20);

    // Economic indicator reliability
    factors.economicIndicators =
      country.gdp !== undefined && country.internet_penetration !== undefined ? 80 : 30;

    return this.calculateConfidence(factors);
  }

  // ------------------------------------------------------------------
  // Risk & opportunity assessment
  // ------------------------------------------------------------------

  /**
   * Assesses risks and opportunities based on country and market data.
   */
  private assessRisksAndOpportunities(
    country: Country,
    marketData: MarketDataSummary,
    competitorData: CompetitorSummary,
  ): { risks: string[]; opportunities: string[] } {
    const risks: string[] = [];
    const opportunities: string[] = [];

    // Economic risks
    if (country.gdp !== undefined && country.gdp < 5_000) {
      risks.push(
        `Low GDP per capita ($${country.gdp}) may limit consumer spending power`,
      );
    }

    // Internet and digital infrastructure
    if (
      country.internet_penetration !== undefined &&
      country.internet_penetration < 50
    ) {
      risks.push(
        `Low internet penetration (${country.internet_penetration}%) limits digital reach`,
      );
    } else if (
      country.internet_penetration !== undefined &&
      country.internet_penetration > 80
    ) {
      opportunities.push(
        `High internet penetration (${country.internet_penetration}%) enables broad digital reach`,
      );
    }

    // E-commerce adoption
    if (
      country.ecommerce_adoption !== undefined &&
      country.ecommerce_adoption > 60
    ) {
      opportunities.push(
        `Strong e-commerce adoption (${country.ecommerce_adoption}%) supports online sales growth`,
      );
    } else if (
      country.ecommerce_adoption !== undefined &&
      country.ecommerce_adoption < 20
    ) {
      risks.push(
        `Low e-commerce adoption (${country.ecommerce_adoption}%) may require education-focused campaigns`,
      );
    }

    // Competition
    if (competitorData.count > 10) {
      risks.push(
        `Crowded competitive landscape with ${competitorData.count} known competitors`,
      );
    } else if (competitorData.count < 3) {
      opportunities.push(
        'Low competition in market presents first-mover advantage potential',
      );
    }

    // Ad cost efficiency
    const avgAdCost = this.calculateAverageAdCost(country.ad_costs ?? {});
    if (avgAdCost !== null && avgAdCost < 1.0) {
      opportunities.push(
        `Low average ad costs ($${avgAdCost.toFixed(2)} CPC) offer cost-efficient acquisition`,
      );
    } else if (avgAdCost !== null && avgAdCost > 5.0) {
      risks.push(
        `High average ad costs ($${avgAdCost.toFixed(2)} CPC) may constrain budget efficiency`,
      );
    }

    // Market maturity
    if (marketData.totalCampaignCount === 0) {
      risks.push('No prior campaign data available - entering market with limited historical insights');
      opportunities.push('Greenfield market with no prior presence - full control of positioning');
    } else if (marketData.averageRoas > 3.0) {
      opportunities.push(
        `Strong existing ROAS (${marketData.averageRoas.toFixed(1)}x) indicates favorable market conditions`,
      );
    } else if (marketData.averageRoas > 0 && marketData.averageRoas < 1.0) {
      risks.push(
        `Below-breakeven ROAS (${marketData.averageRoas.toFixed(1)}x) suggests challenging unit economics`,
      );
    }

    return { risks, opportunities };
  }

  // ------------------------------------------------------------------
  // Private helper methods
  // ------------------------------------------------------------------

  /**
   * Derives the default emotional appeal based on region.
   */
  private deriveEmotionalAppeal(region: string): string {
    const r = region.toLowerCase();
    if (r.includes('east asia')) return 'harmony and quality';
    if (r.includes('south asia')) return 'family and value';
    if (r.includes('middle east')) return 'prestige and trust';
    if (r.includes('latin america')) return 'community and joy';
    if (r.includes('africa')) return 'aspiration and empowerment';
    if (r.includes('western europe')) return 'innovation and sustainability';
    if (r.includes('eastern europe')) return 'reliability and value';
    if (r.includes('north america')) return 'individuality and convenience';
    if (r.includes('oceania')) return 'lifestyle and authenticity';
    if (r.includes('southeast asia')) return 'social belonging and value';
    return 'trust and quality';
  }

  /**
   * Derives default color preferences based on region.
   */
  private deriveDefaultColors(region: string): string[] {
    const r = region.toLowerCase();
    if (r.includes('east asia')) return ['red', 'gold', 'white'];
    if (r.includes('south asia')) return ['orange', 'gold', 'green'];
    if (r.includes('middle east')) return ['green', 'gold', 'blue'];
    if (r.includes('latin america')) return ['red', 'yellow', 'blue'];
    if (r.includes('africa')) return ['green', 'yellow', 'red'];
    if (r.includes('western europe')) return ['blue', 'white', 'green'];
    if (r.includes('eastern europe')) return ['blue', 'red', 'white'];
    if (r.includes('north america')) return ['blue', 'red', 'white'];
    return ['blue', 'white', 'green'];
  }

  /**
   * Calculates the average ad cost across all platform CPC data.
   * Returns null if no ad cost data is available.
   */
  private calculateAverageAdCost(adCosts: Record<string, number>): number | null {
    const values = Object.values(adCosts);
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Gets platform penetration score (0-100) from social platform data.
   */
  private getPlatformPenetration(
    platform: Platform,
    socialPlatforms: Record<string, number>,
  ): number {
    // Map agent platform names to possible keys in social platform data
    const keyMappings: Record<Platform, string[]> = {
      google: ['google', 'youtube', 'google_ads'],
      bing: ['bing', 'microsoft', 'bing_ads'],
      meta: ['meta', 'facebook', 'instagram', 'meta_ads'],
      tiktok: ['tiktok', 'tik_tok', 'tiktok_ads'],
      snapchat: ['snapchat', 'snap', 'snapchat_ads'],
    };

    const keys = keyMappings[platform];
    let maxPenetration = 0;
    for (const key of keys) {
      const val = socialPlatforms[key] ?? socialPlatforms[key.toLowerCase()] ?? 0;
      if (val > maxPenetration) maxPenetration = val;
    }

    return Math.min(100, maxPenetration);
  }

  /**
   * Gets platform cost efficiency score (0-100) from ad cost data.
   * Lower costs yield higher efficiency scores.
   */
  private getPlatformCostEfficiency(
    platform: Platform,
    adCosts: Record<string, number>,
  ): number {
    const keyMappings: Record<Platform, string[]> = {
      google: ['google', 'google_ads', 'google_cpc'],
      bing: ['bing', 'bing_ads', 'bing_cpc'],
      meta: ['meta', 'facebook', 'meta_ads', 'facebook_cpc'],
      tiktok: ['tiktok', 'tiktok_ads', 'tiktok_cpc'],
      snapchat: ['snapchat', 'snapchat_ads', 'snapchat_cpc'],
    };

    const keys = keyMappings[platform];
    let cost: number | null = null;
    for (const key of keys) {
      const val = adCosts[key] ?? adCosts[key.toLowerCase()];
      if (val !== undefined) {
        cost = val;
        break;
      }
    }

    if (cost === null) return 50; // neutral score when no data
    // Invert: lower cost = higher efficiency (max 100)
    return Math.max(0, Math.min(100, 100 - cost * 10));
  }

  /**
   * Derives a strategy description for a specific platform based on
   * its weight and the country characteristics.
   */
  private derivePlatformStrategy(
    platform: Platform,
    weight: number,
    country: Country,
  ): string {
    const ecommerce = country.ecommerce_adoption ?? 0;
    const tierLabel =
      weight >= 0.3 ? 'primary' : weight >= 0.15 ? 'secondary' : 'supporting';

    const strategies: Record<Platform, string> = {
      google: `${tierLabel} search and display channel - target high-intent queries in ${country.language}`,
      bing: `${tierLabel} search supplement - capture professional and B2B audiences`,
      meta: `${tierLabel} social and remarketing channel - leverage visual storytelling for ${country.region} audiences`,
      tiktok: `${tierLabel} short-form video channel - engage younger demographics with localized creative`,
      snapchat: `${tierLabel} ephemeral content channel - build brand awareness among Gen Z audiences`,
    };

    let strategy = strategies[platform];

    if (ecommerce > 60) {
      strategy += ' with direct e-commerce integration';
    }

    return strategy;
  }

  /**
   * Returns the platform name with the highest weight in the mix.
   */
  private getTopPlatform(platformMix: PlatformMixRecommendation): string {
    let topPlatform = 'google';
    let topWeight = 0;

    for (const [platform, config] of Object.entries(platformMix.platforms)) {
      if (config.weight > topWeight) {
        topWeight = config.weight;
        topPlatform = platform;
      }
    }

    return topPlatform;
  }

  /**
   * Builds a fallback brand positioning from country data when AI is unavailable.
   */
  private buildFallbackPositioning(
    country: Country,
    marketData: MarketDataSummary,
  ): BrandPositioning {
    const ecommerceLevel =
      (country.ecommerce_adoption ?? 0) > 50 ? 'mature' : 'emerging';
    const priceAngle =
      (country.gdp ?? 0) < 15_000 ? 'value-driven' : 'quality-focused';

    return {
      positioning: `${priceAngle} brand in ${ecommerceLevel} ${country.region} market targeting ${country.language}-speaking digital consumers`,
      differentiators: [
        `Localized experience for ${country.name} market`,
        `Optimized for ${country.region} consumer preferences`,
        `${country.currency}-native pricing strategy`,
      ],
      valueProposition: `Delivering ${priceAngle} solutions tailored to the ${country.name} market with local language support and culturally relevant experiences`,
      competitiveAdvantage: marketData.competitorCount < 5
        ? `Early market presence with limited competition (${marketData.competitorCount} competitors)`
        : `Data-driven optimization in a competitive ${country.region} landscape`,
    };
  }

  /**
   * Builds a fallback messaging style from country data when AI is unavailable.
   */
  private buildFallbackMessagingStyle(
    country: Country,
    positioning: BrandPositioning,
  ): MessagingStyle {
    const behavior = country.cultural_behavior ?? {};
    const region = country.region.toLowerCase();

    let primary: string;
    let secondary: string;
    let callToAction: string;

    if (
      region.includes('east asia') ||
      region.includes('south asia') ||
      region.includes('middle east')
    ) {
      primary = 'Trust-building narratives emphasizing brand heritage and quality assurance';
      secondary = 'Social proof through testimonials and community endorsements';
      callToAction = 'Polite, suggestive CTAs (e.g., "Discover more", "Learn about our offerings")';
    } else if (region.includes('north america') || region.includes('western europe')) {
      primary = 'Direct value communication highlighting unique benefits and innovation';
      secondary = 'Data-driven social proof with specific metrics and results';
      callToAction = 'Action-oriented CTAs (e.g., "Get started now", "Try it free")';
    } else {
      primary = 'Benefit-focused messaging with cultural relevance and local context';
      secondary = 'Community and relationship building through shared values';
      callToAction = 'Engaging CTAs that balance urgency with cultural appropriateness';
    }

    const avoidPhrases: string[] = [];
    const taboos = behavior.taboos ?? behavior.cultural_taboos ?? '';
    if (taboos) {
      String(taboos)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => avoidPhrases.push(t));
    }

    return {
      primary,
      secondary,
      callToAction,
      avoidPhrases,
    };
  }

  /**
   * Safely parses AI response content as JSON, extracting JSON from
   * markdown code blocks if present.
   */
  private parseAIJson<T>(response: string): T | null {
    try {
      // Try direct parse first
      return JSON.parse(response) as T;
    } catch {
      // Try extracting from markdown code block
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim()) as T;
        } catch {
          this.log.warn('Failed to parse AI JSON from code block');
        }
      }

      // Try finding the first { ... } block
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (braceMatch?.[0]) {
        try {
          return JSON.parse(braceMatch[0]) as T;
        } catch {
          this.log.warn('Failed to parse AI JSON from brace extraction');
        }
      }

      return null;
    }
  }
}

// ============================================================
// Internal summary types (not exported as part of the public API)
// ============================================================

interface MarketDataSummary {
  totalCampaignCount: number;
  activeCampaignCount: number;
  totalBudget: number;
  totalMarketSpend: number;
  averageRoas: number;
  competitorCount: number;
}

interface CompetitorSummary {
  count: number;
  averageSpend: number;
  averageMarketShare: number;
}

// ============================================================
// AI International Growth Engine - Paid Ads Agent (Agent 3)
// Manages Google/Bing/Meta/TikTok/Snapchat ad campaigns with
// campaign creation, retargeting, smart bidding, budget
// optimization, and conversion tracking.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { NotFoundError } from '../../utils/errors';
import type { AgentType, Platform, Campaign, CampaignMetrics, RetargetingConfig } from '../../types';
import type { AgentInput, AgentOutput, AgentConfidenceScore } from '../base/types';

// ---------------------------------------------------------------------------
// Agent-specific types
// ---------------------------------------------------------------------------

export interface CampaignAnalysis {
  campaignId: string;
  metrics: CampaignMetrics;
  trends: {
    ctr: 'improving' | 'declining' | 'stable';
    cpc: 'improving' | 'declining' | 'stable';
    roas: 'improving' | 'declining' | 'stable';
    conversions: 'improving' | 'declining' | 'stable';
  };
  recommendations: string[];
  score: AgentConfidenceScore;
}

export interface BiddingRecommendation {
  strategy: 'target_cpa' | 'target_roas' | 'maximize_conversions' | 'manual';
  suggestedBid: number;
  reasoning: string;
}

export interface CampaignRecommendation {
  name: string;
  platform: Platform;
  type: string;
  budget: number;
  targeting: Record<string, unknown>;
  expectedMetrics: {
    estimatedImpressions: number;
    estimatedClicks: number;
    estimatedConversions: number;
    estimatedCPA: number;
    estimatedROAS: number;
  };
}

export interface ConversionTrackingResult {
  pixelStatus: 'active' | 'inactive' | 'error';
  conversions: number;
  revenue: number;
  issues: string[];
}

export interface PlatformPerformance {
  platform: Platform;
  campaigns: number;
  totalSpend: number;
  totalRevenue: number;
  averageROAS: number;
  topCampaigns: Array<{ id: string; name: string; roas: number }>;
}

export interface BudgetReallocation {
  fromCampaign: string;
  toCampaign: string;
  amount: number;
  reasoning: string;
}

export interface TargetingRecommendation {
  audiences: string[];
  keywords: string[];
  placements: string[];
  exclusions: string[];
}

// ---------------------------------------------------------------------------
// Internal DB row shape for campaign queries
// ---------------------------------------------------------------------------

interface CampaignRow {
  id: string;
  name: string;
  country_id: string;
  platform: Platform;
  type: string;
  status: string;
  budget: number;
  spent: number;
  start_date: string;
  end_date: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  country_name?: string;
}

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'paid_ads_agent';
const CACHE_TTL = 120; // seconds

// ---------------------------------------------------------------------------
// PaidAdsAgent
// ---------------------------------------------------------------------------

/**
 * Agent 3 - Paid Ads Architecture.
 *
 * Manages multi-platform paid advertising campaigns across Google, Bing,
 * Meta, TikTok, and Snapchat. Provides AI-driven campaign performance
 * analysis, bidding optimization, retargeting configuration, conversion
 * tracking, and budget reallocation recommendations.
 *
 * Challenge targets: budget_optimization, performance_analytics,
 * conversion_optimization.
 */
export class PaidAdsAgent extends BaseAgent {
  constructor() {
    super({
      agentType: 'paid_ads',
      model: 'sonnet',
      maxRetries: 3,
      timeoutMs: 30_000,
      confidenceThreshold: 70,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  getChallengeTargets(): AgentType[] {
    return ['budget_optimization', 'performance_analytics', 'conversion_optimization'];
  }

  getSystemPrompt(): string {
    return `You are a paid advertising optimization agent for an international growth engine.
Your role is to analyze multi-platform ad campaigns (Google, Bing, Meta, TikTok, Snapchat)
and provide data-driven recommendations for:
- Campaign performance improvement
- Bidding strategy optimization (target CPA, target ROAS, maximize conversions, manual)
- Budget reallocation across campaigns and platforms
- Retargeting audience configuration
- Conversion tracking health monitoring
- Targeting refinement (audiences, keywords, placements)

Always base recommendations on actual performance data.
Flag uncertainty when data is insufficient or trends are ambiguous.
Provide confidence scores for every recommendation.
Return structured JSON responses.`;
  }

  /**
   * Core processing pipeline:
   * 1. Fetch active campaigns from DB
   * 2. Analyze performance metrics per platform
   * 3. Generate campaign recommendations via AI
   * 4. Optimize bidding strategies
   * 5. Manage retargeting configurations
   * 6. Track conversion performance
   * 7. Return AgentOutput with campaign optimization recommendations
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Starting paid ads processing', { requestId: input.requestId });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Step 1: Fetch active campaigns
    const campaigns = await this.fetchActiveCampaigns(input);

    if (campaigns.length === 0) {
      const confidence = this.calculateConfidence({
        data_availability: 10,
        analysis_depth: 0,
        recommendation_quality: 0,
      });

      uncertainties.push(
        this.flagUncertainty('campaign_data', 'No active campaigns found for analysis'),
      );

      const output = this.buildOutput(
        'no_active_campaigns',
        { campaigns: [], platformPerformance: [] },
        confidence,
        'No active campaigns are currently running. Unable to perform optimization analysis.',
        ['Create new campaigns across target platforms to begin optimization'],
        warnings,
        uncertainties,
      );

      await this.logDecision(input, output);
      return output;
    }

    // Step 2: Analyze performance metrics per platform
    const platforms = this.extractUniquePlatforms(campaigns);
    const platformPerformanceMap: Record<string, PlatformPerformance> = {};

    for (const platform of platforms) {
      try {
        platformPerformanceMap[platform] = await this.getPlatformPerformance(platform);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to analyze platform ${platform}: ${msg}`);
        uncertainties.push(
          this.flagUncertainty('platform_data', `Incomplete data for platform: ${platform}`),
        );
      }
    }

    // Step 3: Analyze individual campaign performance
    const campaignAnalyses: CampaignAnalysis[] = [];

    for (const campaign of campaigns) {
      try {
        const analysis = await this.analyzeCampaignPerformance(campaign.id);
        campaignAnalyses.push(analysis);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to analyze campaign ${campaign.id}: ${msg}`);
      }
    }

    // Step 4: Optimize bidding strategies
    const biddingRecommendations: Record<string, BiddingRecommendation> = {};

    for (const campaign of campaigns) {
      try {
        biddingRecommendations[campaign.id] = await this.optimizeBidding(campaign);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.warn('Bidding optimization failed for campaign', {
          campaignId: campaign.id,
          error: msg,
        });
      }
    }

    // Step 5: Detect underperformers and suggest budget reallocation
    const underperformers = this.detectUnderperformers(campaigns);
    let budgetReallocations: BudgetReallocation[] = [];

    if (underperformers.length > 0) {
      try {
        budgetReallocations = await this.suggestBudgetReallocation(campaigns);
        for (const reallocation of budgetReallocations) {
          recommendations.push(
            `Reallocate $${reallocation.amount.toFixed(2)} from campaign "${reallocation.fromCampaign}" to "${reallocation.toCampaign}": ${reallocation.reasoning}`,
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Budget reallocation analysis failed: ${msg}`);
      }

      warnings.push(
        `${underperformers.length} campaign(s) are underperforming (ROAS < 1.0)`,
      );
    }

    // Step 6: Conversion tracking checks
    const conversionResults: Record<string, ConversionTrackingResult> = {};

    for (const campaign of campaigns) {
      try {
        conversionResults[campaign.id] = await this.trackConversions(campaign.id);
        const result = conversionResults[campaign.id];
        if (result.issues.length > 0) {
          warnings.push(
            `Campaign ${campaign.id} has conversion tracking issues: ${result.issues.join('; ')}`,
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.warn('Conversion tracking check failed', {
          campaignId: campaign.id,
          error: msg,
        });
      }
    }

    // Step 7: Generate AI-driven recommendations
    let aiRecommendations: string[] = [];

    try {
      aiRecommendations = await this.generateAIRecommendations(
        campaigns,
        campaignAnalyses,
        platformPerformanceMap,
      );
      recommendations.push(...aiRecommendations);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn('AI recommendation generation failed; using heuristic-based recommendations', {
        error: msg,
      });
      uncertainties.push(
        this.flagUncertainty('ai_analysis', 'AI model unavailable; recommendations are heuristic-based'),
      );

      // Fallback: generate heuristic recommendations
      const heuristicRecs = this.generateHeuristicRecommendations(campaigns, campaignAnalyses);
      recommendations.push(...heuristicRecs);
    }

    // Compute overall confidence
    const confidence = this.computeOverallConfidence(
      campaigns,
      campaignAnalyses,
      platformPerformanceMap,
      uncertainties,
    );

    // Aggregate bidding recommendations into top-level recommendations
    for (const [campaignId, bidRec] of Object.entries(biddingRecommendations)) {
      recommendations.push(
        `Campaign ${campaignId}: switch bidding to "${bidRec.strategy}" at $${bidRec.suggestedBid.toFixed(2)} - ${bidRec.reasoning}`,
      );
    }

    const output = this.buildOutput(
      'campaign_optimization_complete',
      {
        totalCampaigns: campaigns.length,
        platformPerformance: platformPerformanceMap,
        campaignAnalyses,
        biddingRecommendations,
        budgetReallocations,
        conversionTracking: conversionResults,
        underperformers: underperformers.map((c) => c.id),
      },
      confidence,
      `Analyzed ${campaigns.length} active campaigns across ${platforms.length} platform(s). ` +
        `Found ${underperformers.length} underperformer(s). ` +
        `Generated ${recommendations.length} optimization recommendation(s).`,
      recommendations,
      warnings,
      uncertainties,
    );

    // Persist state and log decision
    await this.persistState({
      lastRunCampaignCount: campaigns.length,
      lastRunPlatforms: platforms,
      lastRunUnderperformers: underperformers.length,
      lastRunRecommendations: recommendations.length,
    });
    await this.logDecision(input, output);

    return output;
  }

  // ------------------------------------------------------------------
  // Public methods
  // ------------------------------------------------------------------

  /**
   * Analyzes a single campaign's performance, computing metrics and
   * identifying trends by comparing current data against historical
   * averages from the database.
   */
  async analyzeCampaignPerformance(campaignId: string): Promise<CampaignAnalysis> {
    this.log.info('Analyzing campaign performance', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:analysis:${campaignId}`;
    const cached = await cacheGet<CampaignAnalysis>(cacheKey);
    if (cached) {
      this.log.debug('Campaign analysis cache hit', { campaignId });
      return cached;
    }

    // Fetch campaign from DB
    const result = await pool.query<CampaignRow>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [campaignId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Campaign with id "${campaignId}" not found`);
    }

    const campaign = result.rows[0];
    const metrics = this.computeMetrics(campaign);

    // Fetch historical averages for trend detection
    const historicalResult = await pool.query<{
      avg_ctr: string | null;
      avg_cpc: string | null;
      avg_roas: string | null;
      avg_conversions: string | null;
    }>(
      `SELECT
         AVG(CASE WHEN impressions > 0 THEN (clicks::float / impressions) * 100 ELSE 0 END) AS avg_ctr,
         AVG(CASE WHEN clicks > 0 THEN spent::float / clicks ELSE 0 END) AS avg_cpc,
         AVG(CASE WHEN spent > 0 THEN revenue::float / spent ELSE 0 END) AS avg_roas,
         AVG(conversions) AS avg_conversions
       FROM campaigns
       WHERE platform = $1 AND status = 'active' AND id != $2`,
      [campaign.platform, campaignId],
    );

    const hist = historicalResult.rows[0];
    const avgCtr = parseFloat(hist.avg_ctr ?? '0');
    const avgCpc = parseFloat(hist.avg_cpc ?? '0');
    const avgRoas = parseFloat(hist.avg_roas ?? '0');
    const avgConversions = parseFloat(hist.avg_conversions ?? '0');

    const trends = {
      ctr: this.determineTrend(metrics.ctr, avgCtr),
      cpc: this.determineTrend(avgCpc, metrics.cpc), // lower CPC is better, so invert
      roas: this.determineTrend(metrics.roas, avgRoas),
      conversions: this.determineTrend(metrics.conversions, avgConversions),
    };

    const analysisRecommendations: string[] = [];

    if (metrics.roas < 1.0 && metrics.spend > 0) {
      analysisRecommendations.push('ROAS below break-even; consider pausing or restructuring this campaign');
    }
    if (metrics.ctr < avgCtr * 0.7 && avgCtr > 0) {
      analysisRecommendations.push('CTR significantly below platform average; review ad creative and targeting');
    }
    if (metrics.cpc > avgCpc * 1.5 && avgCpc > 0) {
      analysisRecommendations.push('CPC significantly above platform average; refine keyword bidding or audience targeting');
    }
    if (metrics.conversions === 0 && metrics.clicks > 50) {
      analysisRecommendations.push('No conversions despite significant clicks; check landing page and conversion tracking');
    }

    const scoreFactors: Record<string, number> = {
      data_completeness: metrics.impressions > 0 ? 85 : 20,
      sample_size: metrics.clicks > 100 ? 90 : Math.min(metrics.clicks, 100),
      roas_health: metrics.roas >= 2.0 ? 90 : metrics.roas >= 1.0 ? 60 : 25,
      trend_clarity: this.trendClarity(trends),
    };

    const score = this.calculateConfidence(scoreFactors);

    const analysis: CampaignAnalysis = {
      campaignId,
      metrics,
      trends,
      recommendations: analysisRecommendations,
      score,
    };

    await cacheSet(cacheKey, analysis, CACHE_TTL);
    return analysis;
  }

  /**
   * Determines the optimal bidding strategy for a campaign based on its
   * performance metrics and maturity (amount of conversion data available).
   */
  async optimizeBidding(campaign: Campaign): Promise<BiddingRecommendation> {
    this.log.info('Optimizing bidding for campaign', { campaignId: campaign.id });

    const metrics = this.buildMetricsFromCampaign(campaign);
    const roas = this.calculateROAS(campaign);

    // Decision logic based on campaign maturity and performance
    if (metrics.conversions < 15) {
      // Not enough conversion data for automated strategies
      return {
        strategy: 'manual',
        suggestedBid: metrics.cpc > 0 ? metrics.cpc : 1.0,
        reasoning: `Insufficient conversion data (${metrics.conversions} conversions). Manual bidding recommended until at least 15 conversions are reached for algorithm learning.`,
      };
    }

    if (roas >= 2.0 && metrics.conversions >= 30) {
      // Strong ROAS, enough data for target ROAS
      return {
        strategy: 'target_roas',
        suggestedBid: roas * 0.9, // Target slightly below current to maintain profitability
        reasoning: `Strong ROAS of ${roas.toFixed(2)} with ${metrics.conversions} conversions. Target ROAS bidding can scale spend while maintaining returns.`,
      };
    }

    if (metrics.cpa > 0 && metrics.conversions >= 30) {
      // Enough data for target CPA
      return {
        strategy: 'target_cpa',
        suggestedBid: metrics.cpa * 0.95, // Target slightly below current CPA
        reasoning: `Sufficient conversion history (${metrics.conversions}). Target CPA of $${(metrics.cpa * 0.95).toFixed(2)} to gradually improve efficiency from current $${metrics.cpa.toFixed(2)}.`,
      };
    }

    // Default: maximize conversions for campaigns with some conversion data
    return {
      strategy: 'maximize_conversions',
      suggestedBid: metrics.cpa > 0 ? metrics.cpa : campaign.budget * 0.05,
      reasoning: `Campaign has ${metrics.conversions} conversions. Maximize conversions strategy to build more conversion data for future optimization.`,
    };
  }

  /**
   * Generates a campaign recommendation for a given country and platform,
   * using AI analysis of existing performance data and market context.
   */
  async createCampaignRecommendation(
    countryId: string,
    platform: Platform,
  ): Promise<CampaignRecommendation> {
    this.log.info('Creating campaign recommendation', { countryId, platform });

    // Fetch existing campaigns for this country and platform for context
    const existingResult = await pool.query<CampaignRow>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.country_id = $1 AND c.platform = $2 AND c.status IN ('active', 'completed')
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [countryId, platform],
    );

    // Fetch country data
    const countryResult = await pool.query<{
      name: string;
      currency: string;
      ad_costs: Record<string, number> | null;
      social_platforms: Record<string, number> | null;
    }>(
      `SELECT name, currency, ad_costs, social_platforms FROM countries WHERE id = $1`,
      [countryId],
    );

    if (countryResult.rows.length === 0) {
      throw new NotFoundError(`Country with id "${countryId}" not found`);
    }

    const country = countryResult.rows[0];
    const existingCampaigns = existingResult.rows;

    // Compute benchmark metrics from existing campaigns
    const benchmarks = this.computeBenchmarks(existingCampaigns);

    // Attempt AI-driven recommendation
    try {
      const aiResponse = await this.callAI(
        this.getSystemPrompt(),
        `Generate a campaign recommendation for ${country.name} on ${platform}.
Existing campaigns: ${existingCampaigns.length} (${existingCampaigns.filter((c) => c.status === 'active').length} active).
Benchmark metrics: ${JSON.stringify(benchmarks)}.
Country ad costs: ${JSON.stringify(country.ad_costs)}.
Platform adoption: ${JSON.stringify(country.social_platforms)}.
Return a JSON object with fields: name, type, budget, targeting, expectedMetrics.`,
      );

      const parsed = JSON.parse(aiResponse);

      return {
        name: parsed.name || `${country.name} - ${platform} Campaign`,
        platform,
        type: parsed.type || 'awareness',
        budget: typeof parsed.budget === 'number' ? parsed.budget : benchmarks.avgBudget,
        targeting: parsed.targeting || {},
        expectedMetrics: {
          estimatedImpressions: parsed.expectedMetrics?.estimatedImpressions ?? 0,
          estimatedClicks: parsed.expectedMetrics?.estimatedClicks ?? 0,
          estimatedConversions: parsed.expectedMetrics?.estimatedConversions ?? 0,
          estimatedCPA: parsed.expectedMetrics?.estimatedCPA ?? benchmarks.avgCpa,
          estimatedROAS: parsed.expectedMetrics?.estimatedROAS ?? benchmarks.avgRoas,
        },
      };
    } catch (error) {
      // Fallback to heuristic-based recommendation
      this.log.warn('AI recommendation failed, using heuristic fallback', {
        countryId,
        platform,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        name: `${country.name} - ${platform} Campaign`,
        platform,
        type: existingCampaigns.length === 0 ? 'awareness' : 'conversion',
        budget: benchmarks.avgBudget > 0 ? benchmarks.avgBudget : 500,
        targeting: {},
        expectedMetrics: {
          estimatedImpressions: benchmarks.avgImpressions,
          estimatedClicks: benchmarks.avgClicks,
          estimatedConversions: benchmarks.avgConversions,
          estimatedCPA: benchmarks.avgCpa,
          estimatedROAS: benchmarks.avgRoas,
        },
      };
    }
  }

  /**
   * Configures retargeting for a campaign by analyzing its conversion
   * funnel and audience behaviour from the database.
   */
  async configureRetargeting(campaignId: string): Promise<RetargetingConfig> {
    this.log.info('Configuring retargeting', { campaignId });

    // Verify campaign exists
    const campaignResult = await pool.query<CampaignRow>(
      `SELECT * FROM campaigns WHERE id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign with id "${campaignId}" not found`);
    }

    const campaign = campaignResult.rows[0];
    const metrics = this.computeMetrics(campaign);

    // Determine lookback window based on conversion cycle
    let lookbackDays: number;
    if (metrics.conversions > 0 && metrics.clicks > 0) {
      const conversionRate = metrics.conversions / metrics.clicks;
      // Higher conversion rate = shorter lookback, lower = longer lookback
      lookbackDays = conversionRate >= 0.05 ? 7 : conversionRate >= 0.02 ? 14 : 30;
    } else {
      lookbackDays = 30; // Default for campaigns without conversion data
    }

    // Build audience list based on campaign platform and type
    const audienceIds: string[] = [];
    const exclusions: string[] = [];

    // Fetch existing audience segments from DB if available
    const audienceResult = await pool.query<{ id: string; segment_type: string }>(
      `SELECT id, segment_type FROM audience_segments
       WHERE campaign_id = $1 AND is_active = true`,
      [campaignId],
    ).catch(() => {
      // audience_segments table may not exist yet
      this.log.debug('audience_segments table not available', { campaignId });
      return { rows: [] as Array<{ id: string; segment_type: string }> };
    });

    for (const row of audienceResult.rows) {
      if (row.segment_type === 'exclusion') {
        exclusions.push(row.id);
      } else {
        audienceIds.push(row.id);
      }
    }

    // Determine if retargeting should be enabled
    const enabled = metrics.impressions > 1000 && metrics.clicks > 10;

    if (!enabled) {
      this.log.info('Retargeting not enabled: insufficient traffic data', {
        campaignId,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
      });
    }

    return {
      enabled,
      audience_ids: audienceIds,
      lookback_days: lookbackDays,
      exclusions,
    };
  }

  /**
   * Checks conversion tracking health for a campaign by examining pixel
   * data, recent conversion counts, and revenue attribution.
   */
  async trackConversions(campaignId: string): Promise<ConversionTrackingResult> {
    this.log.info('Tracking conversions', { campaignId });

    const campaignResult = await pool.query<CampaignRow>(
      `SELECT * FROM campaigns WHERE id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign with id "${campaignId}" not found`);
    }

    const campaign = campaignResult.rows[0];
    const issues: string[] = [];

    // Determine pixel status based on data integrity checks
    let pixelStatus: ConversionTrackingResult['pixelStatus'] = 'active';

    const conversions = Number(campaign.conversions) || 0;
    const revenue = Number(campaign.revenue) || 0;
    const clicks = Number(campaign.clicks) || 0;
    const spent = Number(campaign.spent) || 0;

    // Check for data anomalies that suggest tracking issues
    if (clicks > 100 && conversions === 0) {
      issues.push('No conversions despite significant click volume; verify pixel installation');
      pixelStatus = 'error';
    }

    if (conversions > 0 && revenue === 0) {
      issues.push('Conversions recorded but no revenue attributed; check revenue tracking configuration');
      pixelStatus = pixelStatus === 'error' ? 'error' : 'inactive';
    }

    if (conversions > clicks && clicks > 0) {
      issues.push('Conversion count exceeds click count; possible duplicate tracking or misconfiguration');
      pixelStatus = 'error';
    }

    if (spent > 0 && clicks === 0 && campaign.status === 'active') {
      issues.push('Budget being spent with no clicks registered; verify ad serving and tracking');
      pixelStatus = 'error';
    }

    // Check for conversion tracking freshness via database
    const recentConversionsResult = await pool.query<{ recent_count: string }>(
      `SELECT COUNT(*) AS recent_count
       FROM conversion_events
       WHERE campaign_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [campaignId],
    ).catch(() => {
      // conversion_events table may not exist yet
      this.log.debug('conversion_events table not available', { campaignId });
      return { rows: [{ recent_count: '0' }] };
    });

    const recentCount = parseInt(recentConversionsResult.rows[0].recent_count, 10);
    if (campaign.status === 'active' && conversions > 0 && recentCount === 0) {
      issues.push('No conversions recorded in the last 24 hours for an active campaign with historical conversions');
      if (pixelStatus === 'active') {
        pixelStatus = 'inactive';
      }
    }

    return {
      pixelStatus,
      conversions,
      revenue,
      issues,
    };
  }

  /**
   * Aggregates performance data for a specific advertising platform by
   * querying all campaigns on that platform.
   */
  async getPlatformPerformance(platform: Platform): Promise<PlatformPerformance> {
    this.log.info('Getting platform performance', { platform });

    const cacheKey = `${CACHE_PREFIX}:platform:${platform}`;
    const cached = await cacheGet<PlatformPerformance>(cacheKey);
    if (cached) {
      this.log.debug('Platform performance cache hit', { platform });
      return cached;
    }

    const result = await pool.query<CampaignRow>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.platform = $1 AND c.status = 'active'
       ORDER BY c.created_at DESC`,
      [platform],
    );

    const campaigns = result.rows;
    let totalSpend = 0;
    let totalRevenue = 0;
    const campaignROAS: Array<{ id: string; name: string; roas: number }> = [];

    for (const campaign of campaigns) {
      const spent = Number(campaign.spent) || 0;
      const revenue = Number(campaign.revenue) || 0;
      totalSpend += spent;
      totalRevenue += revenue;

      const roas = spent > 0 ? revenue / spent : 0;
      campaignROAS.push({ id: campaign.id, name: campaign.name, roas });
    }

    // Sort by ROAS descending and take top 5
    campaignROAS.sort((a, b) => b.roas - a.roas);
    const topCampaigns = campaignROAS.slice(0, 5);

    const averageROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const performanceData: PlatformPerformance = {
      platform,
      campaigns: campaigns.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      averageROAS: Math.round(averageROAS * 100) / 100,
      topCampaigns,
    };

    await cacheSet(cacheKey, performanceData, CACHE_TTL);
    return performanceData;
  }

  /**
   * Suggests budget reallocations from underperforming campaigns to
   * higher-performing ones to maximize overall portfolio ROAS.
   */
  async suggestBudgetReallocation(campaigns: Campaign[]): Promise<BudgetReallocation[]> {
    this.log.info('Suggesting budget reallocation', {
      campaignCount: campaigns.length,
    });

    if (campaigns.length < 2) {
      return [];
    }

    const reallocations: BudgetReallocation[] = [];

    // Score each campaign by ROAS
    const scored = campaigns
      .map((c) => ({
        campaign: c,
        roas: this.calculateROAS(c),
      }))
      .filter((s) => s.campaign.spent > 0 || s.campaign.budget > 0);

    if (scored.length < 2) {
      return [];
    }

    // Sort by ROAS ascending (worst performers first)
    scored.sort((a, b) => a.roas - b.roas);

    const underperformers = scored.filter((s) => s.roas < 1.0);
    const topPerformers = scored.filter((s) => s.roas >= 2.0);

    if (underperformers.length === 0 || topPerformers.length === 0) {
      return [];
    }

    // Reallocate up to 20% of underperformer budgets to top performers
    for (const under of underperformers) {
      const reallocationAmount = under.campaign.budget * 0.2;
      if (reallocationAmount <= 0) continue;

      // Distribute to the best performer
      const best = topPerformers[0];

      reallocations.push({
        fromCampaign: under.campaign.id,
        toCampaign: best.campaign.id,
        amount: Math.round(reallocationAmount * 100) / 100,
        reasoning:
          `Campaign "${under.campaign.id}" has ROAS of ${under.roas.toFixed(2)} (below break-even). ` +
          `Reallocating 20% of budget ($${reallocationAmount.toFixed(2)}) to campaign "${best.campaign.id}" ` +
          `which has ROAS of ${best.roas.toFixed(2)}.`,
      });
    }

    return reallocations;
  }

  /**
   * Identifies campaigns that are underperforming based on ROAS < 1.0
   * (spending more than earning) and having meaningful spend data.
   */
  detectUnderperformers(campaigns: Campaign[]): Campaign[] {
    return campaigns.filter((campaign) => {
      const spent = Number(campaign.spent) || 0;
      if (spent === 0) return false; // No spend data yet — not underperforming

      const roas = this.calculateROAS(campaign);
      return roas < 1.0;
    });
  }

  /**
   * Computes Return on Ad Spend for a campaign.
   * Returns 0 if no spend has been recorded.
   */
  calculateROAS(campaign: Campaign): number {
    const spent = Number(campaign.spent) || 0;
    if (spent === 0) return 0;

    // Campaign type from DB may have revenue on metrics or as direct field
    const metrics = campaign.metrics;
    const revenue = metrics
      ? (Number((metrics as unknown as Record<string, unknown>).revenue) || 0)
      : 0;

    // Also check for revenue in the campaign object directly (DB schema has revenue column)
    const directRevenue = Number((campaign as unknown as CampaignRow).revenue) || 0;
    const effectiveRevenue = revenue > 0 ? revenue : directRevenue;

    if (effectiveRevenue > 0) {
      return Math.round((effectiveRevenue / spent) * 100) / 100;
    }

    // Fall back to pre-computed ROAS on the metrics object if available
    if (metrics && typeof (metrics as CampaignMetrics).roas === 'number') {
      return (metrics as CampaignMetrics).roas;
    }

    return 0;
  }

  /**
   * Generates AI-driven targeting recommendations for a campaign
   * based on its performance data and the platform's audience features.
   */
  async optimizeTargeting(campaign: Campaign): Promise<TargetingRecommendation> {
    this.log.info('Optimizing targeting', { campaignId: campaign.id });

    const metrics = this.buildMetricsFromCampaign(campaign);

    try {
      const aiResponse = await this.callAI(
        this.getSystemPrompt(),
        `Optimize targeting for campaign "${campaign.name}" on ${campaign.platform}.
Current metrics: CTR=${metrics.ctr.toFixed(2)}%, CPC=$${metrics.cpc.toFixed(2)}, CPA=$${metrics.cpa.toFixed(2)}, ROAS=${metrics.roas.toFixed(2)}.
Campaign type: ${campaign.type}.
Current targeting: ${JSON.stringify(campaign.targeting || {})}.
Return a JSON object with fields: audiences (string[]), keywords (string[]), placements (string[]), exclusions (string[]).`,
      );

      const parsed = JSON.parse(aiResponse);

      return {
        audiences: Array.isArray(parsed.audiences) ? parsed.audiences : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        placements: Array.isArray(parsed.placements) ? parsed.placements : [],
        exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
      };
    } catch (error) {
      // Fallback to heuristic targeting recommendations
      this.log.warn('AI targeting optimization failed, using heuristic fallback', {
        campaignId: campaign.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return this.buildHeuristicTargeting(campaign, metrics);
    }
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Fetches active campaigns from the database, optionally filtered
   * by country_id or platform from input parameters.
   */
  private async fetchActiveCampaigns(input: AgentInput): Promise<Campaign[]> {
    const conditions: string[] = [`c.status = 'active'`];
    const params: unknown[] = [];
    let paramIndex = 1;

    const countryId = input.parameters.countryId as string | undefined;
    if (countryId) {
      conditions.push(`c.country_id = $${paramIndex++}`);
      params.push(countryId);
    }

    const platform = input.parameters.platform as Platform | undefined;
    if (platform) {
      conditions.push(`c.platform = $${paramIndex++}`);
      params.push(platform);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query<CampaignRow>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC`,
      params,
    );

    // Map DB rows to Campaign type
    return result.rows.map((row) => this.mapRowToCampaign(row));
  }

  /**
   * Maps a database row to the Campaign interface.
   */
  private mapRowToCampaign(row: CampaignRow): Campaign {
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const conversions = Number(row.conversions) || 0;
    const spent = Number(row.spent) || 0;
    const revenue = Number(row.revenue) || 0;

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spent / clicks : 0;
    const cpa = conversions > 0 ? spent / conversions : 0;
    const roas = spent > 0 ? revenue / spent : 0;

    return {
      id: row.id,
      name: row.name,
      country_id: row.country_id,
      platform: row.platform,
      type: row.type,
      status: row.status as Campaign['status'],
      budget: Number(row.budget) || 0,
      spent,
      start_date: row.start_date,
      end_date: row.end_date ?? undefined,
      targeting: {},
      metrics: {
        impressions,
        clicks,
        conversions,
        spend: spent,
        ctr: Math.round(ctr * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        cpa: Math.round(cpa * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      },
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      country_name: row.country_name,
    };
  }

  /**
   * Computes standard campaign metrics from a raw database row.
   */
  private computeMetrics(row: CampaignRow): CampaignMetrics {
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const conversions = Number(row.conversions) || 0;
    const spend = Number(row.spent) || 0;
    const revenue = Number(row.revenue) || 0;

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    return {
      impressions,
      clicks,
      conversions,
      spend,
      ctr: Math.round(ctr * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      cpa: Math.round(cpa * 100) / 100,
      roas: Math.round(roas * 100) / 100,
    };
  }

  /**
   * Builds a CampaignMetrics object from the Campaign interface.
   */
  private buildMetricsFromCampaign(campaign: Campaign): CampaignMetrics {
    if (campaign.metrics) {
      return campaign.metrics;
    }

    const spent = Number(campaign.spent) || 0;
    return {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: spent,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
    };
  }

  /**
   * Determines trend direction by comparing a current value to a benchmark.
   * A tolerance band of 10% is used to classify values as 'stable'.
   */
  private determineTrend(
    current: number,
    benchmark: number,
  ): 'improving' | 'declining' | 'stable' {
    if (benchmark === 0) return 'stable';
    const ratio = current / benchmark;
    if (ratio > 1.1) return 'improving';
    if (ratio < 0.9) return 'declining';
    return 'stable';
  }

  /**
   * Quantifies the clarity of trends for confidence scoring.
   * Trends that are strongly directional contribute higher confidence.
   */
  private trendClarity(trends: CampaignAnalysis['trends']): number {
    let score = 50; // baseline
    const trendValues = Object.values(trends);
    const nonStable = trendValues.filter((t) => t !== 'stable').length;
    score += nonStable * 10; // clear trends add confidence
    return Math.min(score, 100);
  }

  /**
   * Extracts unique platform identifiers from a list of campaigns.
   */
  private extractUniquePlatforms(campaigns: Campaign[]): Platform[] {
    const platformSet = new Set<Platform>();
    for (const campaign of campaigns) {
      platformSet.add(campaign.platform);
    }
    return Array.from(platformSet);
  }

  /**
   * Computes benchmark averages from a set of historical campaign rows.
   */
  private computeBenchmarks(campaigns: CampaignRow[]): {
    avgBudget: number;
    avgImpressions: number;
    avgClicks: number;
    avgConversions: number;
    avgCpa: number;
    avgRoas: number;
  } {
    if (campaigns.length === 0) {
      return {
        avgBudget: 500,
        avgImpressions: 0,
        avgClicks: 0,
        avgConversions: 0,
        avgCpa: 0,
        avgRoas: 0,
      };
    }

    let totalBudget = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalSpent = 0;
    let totalRevenue = 0;

    for (const c of campaigns) {
      totalBudget += Number(c.budget) || 0;
      totalImpressions += Number(c.impressions) || 0;
      totalClicks += Number(c.clicks) || 0;
      totalConversions += Number(c.conversions) || 0;
      totalSpent += Number(c.spent) || 0;
      totalRevenue += Number(c.revenue) || 0;
    }

    const count = campaigns.length;
    const avgConversions = totalConversions / count;
    const avgCpa = totalConversions > 0 ? totalSpent / totalConversions : 0;
    const avgRoas = totalSpent > 0 ? totalRevenue / totalSpent : 0;

    return {
      avgBudget: Math.round((totalBudget / count) * 100) / 100,
      avgImpressions: Math.round(totalImpressions / count),
      avgClicks: Math.round(totalClicks / count),
      avgConversions: Math.round(avgConversions * 100) / 100,
      avgCpa: Math.round(avgCpa * 100) / 100,
      avgRoas: Math.round(avgRoas * 100) / 100,
    };
  }

  /**
   * Generates AI-powered recommendations from campaign data.
   */
  private async generateAIRecommendations(
    campaigns: Campaign[],
    analyses: CampaignAnalysis[],
    platformPerformance: Record<string, PlatformPerformance>,
  ): Promise<string[]> {
    const summary = {
      totalCampaigns: campaigns.length,
      activePlatforms: Object.keys(platformPerformance),
      averageROAS: this.computeAverageROAS(campaigns),
      underperformingCount: this.detectUnderperformers(campaigns).length,
      analysisHighlights: analyses.map((a) => ({
        campaignId: a.campaignId,
        roas: a.metrics.roas,
        trends: a.trends,
        issueCount: a.recommendations.length,
      })),
    };

    const aiResponse = await this.callAI(
      this.getSystemPrompt(),
      `Analyze the following paid ads portfolio and provide optimization recommendations.
Portfolio summary: ${JSON.stringify(summary)}.
Return a JSON array of recommendation strings.`,
    );

    const parsed = JSON.parse(aiResponse);

    if (Array.isArray(parsed)) {
      return parsed.filter((item: unknown) => typeof item === 'string');
    }
    if (Array.isArray(parsed.recommendations)) {
      return parsed.recommendations.filter((item: unknown) => typeof item === 'string');
    }

    return [];
  }

  /**
   * Fallback heuristic recommendations when AI is unavailable.
   */
  private generateHeuristicRecommendations(
    campaigns: Campaign[],
    analyses: CampaignAnalysis[],
  ): string[] {
    const recommendations: string[] = [];
    const avgROAS = this.computeAverageROAS(campaigns);

    if (avgROAS < 1.0) {
      recommendations.push(
        `Portfolio ROAS (${avgROAS.toFixed(2)}) is below break-even. Consider pausing lowest-performing campaigns and consolidating budget.`,
      );
    } else if (avgROAS < 2.0) {
      recommendations.push(
        `Portfolio ROAS (${avgROAS.toFixed(2)}) is positive but below target. Focus on improving conversion rates and reducing CPA.`,
      );
    }

    const platforms = this.extractUniquePlatforms(campaigns);
    if (platforms.length === 1) {
      recommendations.push(
        'Campaign portfolio is concentrated on a single platform. Consider diversifying across additional platforms to reduce risk.',
      );
    }

    for (const analysis of analyses) {
      if (analysis.trends.roas === 'declining') {
        recommendations.push(
          `Campaign ${analysis.campaignId} shows declining ROAS trend. Investigate root cause and consider bid adjustments.`,
        );
      }
      if (analysis.trends.ctr === 'declining') {
        recommendations.push(
          `Campaign ${analysis.campaignId} shows declining CTR. Refresh ad creatives and test new messaging.`,
        );
      }
    }

    return recommendations;
  }

  /**
   * Builds heuristic targeting recommendations as a fallback when AI
   * is unavailable.
   */
  private buildHeuristicTargeting(
    campaign: Campaign,
    metrics: CampaignMetrics,
  ): TargetingRecommendation {
    const audiences: string[] = [];
    const keywords: string[] = [];
    const placements: string[] = [];
    const exclusions: string[] = [];

    // Platform-specific defaults
    switch (campaign.platform) {
      case 'google':
      case 'bing':
        if (metrics.ctr < 2.0) {
          keywords.push('long-tail keywords to improve relevance');
        }
        if (metrics.cpc > 5.0) {
          exclusions.push('broad match keywords with low conversion rates');
        }
        placements.push('search network');
        if (metrics.roas >= 1.5) {
          placements.push('display network for remarketing');
        }
        break;

      case 'meta':
        audiences.push('lookalike audiences based on converters');
        if (metrics.ctr < 1.0) {
          audiences.push('interest-based targeting refinement');
        }
        exclusions.push('audiences that have already converted');
        placements.push('feed', 'stories');
        break;

      case 'tiktok':
        audiences.push('interest categories aligned with product');
        placements.push('in-feed', 'top-view');
        if (metrics.conversions > 0) {
          audiences.push('custom audience from website visitors');
        }
        break;

      case 'snapchat':
        audiences.push('snap audience match');
        placements.push('between content', 'discover');
        break;
    }

    return { audiences, keywords, placements, exclusions };
  }

  /**
   * Computes the portfolio-wide average ROAS.
   */
  private computeAverageROAS(campaigns: Campaign[]): number {
    let totalSpent = 0;
    let totalRevenue = 0;

    for (const campaign of campaigns) {
      const spent = Number(campaign.spent) || 0;
      totalSpent += spent;

      const metrics = campaign.metrics;
      const revenue = metrics
        ? (Number((metrics as unknown as Record<string, unknown>).revenue) || 0)
        : 0;
      const directRevenue = Number((campaign as unknown as CampaignRow).revenue) || 0;
      totalRevenue += revenue > 0 ? revenue : directRevenue;
    }

    if (totalSpent === 0) return 0;
    return Math.round((totalRevenue / totalSpent) * 100) / 100;
  }

  /**
   * Computes overall confidence for the full process() run based on
   * data quality, analysis coverage, and uncertainty count.
   */
  private computeOverallConfidence(
    campaigns: Campaign[],
    analyses: CampaignAnalysis[],
    platformPerformance: Record<string, PlatformPerformance>,
    uncertainties: string[],
  ): AgentConfidenceScore {
    const analysisCoverage =
      campaigns.length > 0
        ? (analyses.length / campaigns.length) * 100
        : 0;

    const platformCoverage =
      Object.keys(platformPerformance).length > 0 ? 80 : 20;

    const dataVolume =
      campaigns.reduce((sum, c) => sum + (Number(c.spent) || 0), 0) > 0
        ? 75
        : 20;

    const uncertaintyPenalty = Math.max(0, 100 - uncertainties.length * 20);

    return this.calculateConfidence({
      analysis_coverage: analysisCoverage,
      platform_coverage: platformCoverage,
      data_volume: dataVolume,
      uncertainty_factor: uncertaintyPenalty,
    });
  }
}

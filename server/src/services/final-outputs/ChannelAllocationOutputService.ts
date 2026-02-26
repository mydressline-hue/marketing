/**
 * Channel Allocation Matrix Service.
 *
 * Phase 10 Final Output Deliverable #3.
 * Aggregates data from Agent 3 (Paid Ads), Agent 7 (Performance Analytics),
 * and Agent 8 (Budget Optimization) via the agent_decisions table, combined
 * with budget allocations and campaign performance data to produce a
 * comprehensive channel allocation matrix.
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
 * Channel allocation entry in the matrix.
 */
export interface ChannelAllocation {
  /** Channel name (e.g. Google, Meta, TikTok) */
  channel: string;
  /** Percentage of total budget allocated to this channel (0-100) */
  budget_allocation_pct: number;
  /** Expected return on ad spend */
  expected_roas: number;
  /** Estimated customer acquisition cost */
  cac_estimate: number;
  /** Countries where this channel is recommended */
  recommended_countries: string[];
  /** Priority level for this channel */
  priority_level: 'critical' | 'high' | 'medium' | 'low' | 'experimental';
  /** Scaling potential assessment */
  scaling_potential: 'high' | 'medium' | 'low';
  /** Risk level for this channel */
  risk_level: 'low' | 'medium' | 'high';
}

/**
 * Per-country channel breakdown entry.
 */
export interface CountryChannelEntry {
  /** Channel name */
  channel: string;
  /** Allocation percentage within this country */
  allocation_pct: number;
  /** Estimated spend in the country for this channel */
  estimated_spend: number;
  /** Projected conversions from this channel in this country */
  projected_conversions: number;
}

/**
 * Country-level channel breakdown.
 */
export interface CountryChannels {
  /** ISO country code */
  country_code: string;
  /** Channel breakdowns for this country */
  channels: CountryChannelEntry[];
}

/**
 * Complete channel allocation matrix output.
 */
export interface ChannelAllocationMatrix {
  /** Channel allocation entries */
  matrix: ChannelAllocation[];
  /** Per-country breakdowns */
  country_breakdown: CountryChannels[];
  /** Total budget across all channels */
  total_budget: number;
  /** Optimization notes from agent decisions */
  optimization_notes: string[];
  /** ISO-8601 timestamp when the matrix was generated */
  generated_at: string;
  /** Confidence score for the overall allocation (0-1) */
  confidence_score: number;
}

/**
 * Historical channel performance entry.
 */
export interface ChannelPerformanceHistory {
  /** Channel name */
  channel: string;
  /** Period label */
  period: string;
  /** Total spend in the period */
  spend: number;
  /** Total revenue in the period */
  revenue: number;
  /** ROAS for the period */
  roas: number;
  /** Number of conversions */
  conversions: number;
  /** Click count */
  clicks: number;
  /** Impression count */
  impressions: number;
}

// ---------------------------------------------------------------------------
// Internal DB row types
// ---------------------------------------------------------------------------

interface AgentDecisionRow {
  id: string;
  agent_type: string;
  decision_type: string;
  decision_data: Record<string, unknown>;
  confidence: number;
  created_at: string;
}

interface BudgetAllocationRow {
  id: string;
  country_id: string;
  channel_allocations: Record<string, number>;
  total_budget: number;
  total_spent: number;
  period_start: string;
  period_end: string;
}

interface CampaignRow {
  id: string;
  country_id: string;
  platform: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  status: string;
}

interface CountryRow {
  id: string;
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'final_output:channel_allocation';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Supported channels
// ---------------------------------------------------------------------------

const SUPPORTED_CHANNELS = [
  'Google',
  'Meta',
  'TikTok',
  'Bing',
  'Snapchat',
  'Organic Social',
  'Email',
  'Content/SEO',
] as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ChannelAllocationOutputService {
  /**
   * Generates the full channel allocation matrix by aggregating data from
   * agent decisions, budget allocations, and campaign performance.
   */
  static async generateChannelAllocationMatrix(): Promise<ChannelAllocationMatrix> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:latest`;
    const cached = await cacheGet<ChannelAllocationMatrix>(cacheKey);

    if (cached) {
      logger.debug('Channel allocation matrix cache hit');
      return cached;
    }

    // Fetch all required data from DB in parallel
    const [agentDecisions, budgetAllocations, campaigns, countries] =
      await Promise.all([
        ChannelAllocationOutputService.fetchAgentDecisions(),
        ChannelAllocationOutputService.fetchBudgetAllocations(),
        ChannelAllocationOutputService.fetchActiveCampaigns(),
        ChannelAllocationOutputService.fetchCountries(),
      ]);

    // Build country lookup
    const countryLookup = new Map<string, CountryRow>();
    for (const c of countries) {
      countryLookup.set(c.id, c);
    }

    // Compute total budget from budget allocations
    const totalBudget = budgetAllocations.reduce(
      (sum, ba) => sum + Number(ba.total_budget),
      0,
    );

    // Aggregate channel-level data
    const channelMetrics = ChannelAllocationOutputService.aggregateChannelMetrics(
      campaigns,
      budgetAllocations,
      countryLookup,
    );

    // Extract agent insights
    const agentInsights =
      ChannelAllocationOutputService.extractAgentInsights(agentDecisions);

    // Build the channel allocation matrix
    const matrix = ChannelAllocationOutputService.buildChannelMatrix(
      channelMetrics,
      agentInsights,
      totalBudget,
    );

    // Build per-country breakdown
    const countryBreakdown =
      ChannelAllocationOutputService.buildCountryBreakdown(
        budgetAllocations,
        campaigns,
        countryLookup,
      );

    // Compute overall confidence from agent decisions
    const confidenceScore =
      ChannelAllocationOutputService.computeConfidence(agentDecisions);

    // Gather optimization notes from agent decisions
    const optimizationNotes =
      ChannelAllocationOutputService.gatherOptimizationNotes(agentDecisions);

    const result: ChannelAllocationMatrix = {
      matrix,
      country_breakdown: countryBreakdown,
      total_budget: totalBudget,
      optimization_notes: optimizationNotes,
      generated_at: new Date().toISOString(),
      confidence_score: confidenceScore,
    };

    // Cache the result
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('Channel allocation matrix generated', {
      channelCount: matrix.length,
      countryCount: countryBreakdown.length,
      totalBudget,
      confidenceScore,
    });

    return result;
  }

  /**
   * Returns the channel allocation matrix filtered for a specific country.
   */
  static async getCountryAllocation(
    countryCode: string,
  ): Promise<CountryChannels | null> {
    const matrix = await ChannelAllocationOutputService.generateChannelAllocationMatrix();
    const countryData = matrix.country_breakdown.find(
      (cb) => cb.country_code.toUpperCase() === countryCode.toUpperCase(),
    );
    return countryData ?? null;
  }

  /**
   * Returns historical channel performance data from campaign records.
   */
  static async getChannelPerformanceHistory(): Promise<
    ChannelPerformanceHistory[]
  > {
    const cacheKey = `${CACHE_PREFIX}:history`;
    const cached = await cacheGet<ChannelPerformanceHistory[]>(cacheKey);

    if (cached) {
      logger.debug('Channel performance history cache hit');
      return cached;
    }

    const result = await pool.query<{
      platform: string;
      period: string;
      total_spend: string;
      total_revenue: string;
      total_conversions: string;
      total_clicks: string;
      total_impressions: string;
    }>(
      `SELECT
         c.platform,
         TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
         COALESCE(SUM(c.spent), 0)::text AS total_spend,
         COALESCE(SUM(c.revenue), 0)::text AS total_revenue,
         COALESCE(SUM(c.conversions), 0)::text AS total_conversions,
         COALESCE(SUM(c.clicks), 0)::text AS total_clicks,
         COALESCE(SUM(c.impressions), 0)::text AS total_impressions
       FROM campaigns c
       WHERE c.status != 'archived'
       GROUP BY c.platform, DATE_TRUNC('month', c.start_date::date)
       ORDER BY period DESC, c.platform ASC`,
    );

    const history: ChannelPerformanceHistory[] = result.rows.map((row) => {
      const spend = parseFloat(row.total_spend);
      const revenue = parseFloat(row.total_revenue);

      return {
        channel: row.platform,
        period: row.period,
        spend,
        revenue,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        conversions: parseInt(row.total_conversions, 10),
        clicks: parseInt(row.total_clicks, 10),
        impressions: parseInt(row.total_impressions, 10),
      };
    });

    await cacheSet(cacheKey, history, CACHE_TTL);
    logger.info('Channel performance history generated', {
      entries: history.length,
    });

    return history;
  }

  // -----------------------------------------------------------------------
  // Data fetching helpers
  // -----------------------------------------------------------------------

  /**
   * Fetches agent decisions from Agents 3, 7, and 8.
   */
  static async fetchAgentDecisions(): Promise<AgentDecisionRow[]> {
    const result = await pool.query<AgentDecisionRow>(
      `SELECT id, agent_type, decision_type, decision_data, confidence, created_at
       FROM agent_decisions
       WHERE agent_type IN ('paid_ads', 'performance_analytics', 'budget_optimization')
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    return result.rows;
  }

  /**
   * Fetches current budget allocations.
   */
  static async fetchBudgetAllocations(): Promise<BudgetAllocationRow[]> {
    const result = await pool.query<BudgetAllocationRow>(
      `SELECT id, country_id, channel_allocations, total_budget, total_spent, period_start, period_end
       FROM budget_allocations
       WHERE period_end >= CURRENT_DATE
       ORDER BY period_start DESC`,
    );
    return result.rows;
  }

  /**
   * Fetches active campaigns with performance data.
   */
  static async fetchActiveCampaigns(): Promise<CampaignRow[]> {
    const result = await pool.query<CampaignRow>(
      `SELECT id, country_id, platform, budget, spent, impressions, clicks, conversions, revenue, status
       FROM campaigns
       WHERE status IN ('active', 'paused', 'completed')
       ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  /**
   * Fetches all countries.
   */
  static async fetchCountries(): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>(
      `SELECT id, code, name FROM countries WHERE is_active = true ORDER BY name ASC`,
    );
    return result.rows;
  }

  // -----------------------------------------------------------------------
  // Aggregation helpers
  // -----------------------------------------------------------------------

  /**
   * Aggregates channel-level metrics from campaigns and budget allocations.
   */
  static aggregateChannelMetrics(
    campaigns: CampaignRow[],
    budgetAllocations: BudgetAllocationRow[],
    countryLookup: Map<string, CountryRow>,
  ): Map<
    string,
    {
      totalSpend: number;
      totalRevenue: number;
      totalConversions: number;
      totalBudgetAllocated: number;
      countries: Set<string>;
    }
  > {
    const channelMap = new Map<
      string,
      {
        totalSpend: number;
        totalRevenue: number;
        totalConversions: number;
        totalBudgetAllocated: number;
        countries: Set<string>;
      }
    >();

    // Initialize with empty metrics for all supported channels
    for (const ch of SUPPORTED_CHANNELS) {
      channelMap.set(ch.toLowerCase(), {
        totalSpend: 0,
        totalRevenue: 0,
        totalConversions: 0,
        totalBudgetAllocated: 0,
        countries: new Set<string>(),
      });
    }

    // Aggregate from campaigns
    for (const campaign of campaigns) {
      const channelKey = campaign.platform.toLowerCase();
      const existing = channelMap.get(channelKey) ?? {
        totalSpend: 0,
        totalRevenue: 0,
        totalConversions: 0,
        totalBudgetAllocated: 0,
        countries: new Set<string>(),
      };

      existing.totalSpend += Number(campaign.spent) || 0;
      existing.totalRevenue += Number(campaign.revenue) || 0;
      existing.totalConversions += Number(campaign.conversions) || 0;
      existing.totalBudgetAllocated += Number(campaign.budget) || 0;

      const country = countryLookup.get(campaign.country_id);
      if (country) {
        existing.countries.add(country.code);
      }

      channelMap.set(channelKey, existing);
    }

    // Augment with budget allocation data
    for (const allocation of budgetAllocations) {
      const channelAllocs = allocation.channel_allocations;
      if (!channelAllocs || typeof channelAllocs !== 'object') continue;

      const country = countryLookup.get(allocation.country_id);

      for (const [channelKey, amount] of Object.entries(channelAllocs)) {
        const normalizedKey = channelKey.toLowerCase();
        const existing = channelMap.get(normalizedKey);
        if (existing && country) {
          existing.totalBudgetAllocated += Number(amount) || 0;
          existing.countries.add(country.code);
        }
      }
    }

    return channelMap;
  }

  /**
   * Extracts insights from agent decisions.
   */
  static extractAgentInsights(decisions: AgentDecisionRow[]): Map<
    string,
    {
      recommendations: string[];
      riskAssessments: string[];
      scalingRecommendations: string[];
      confidences: number[];
    }
  > {
    const insights = new Map<
      string,
      {
        recommendations: string[];
        riskAssessments: string[];
        scalingRecommendations: string[];
        confidences: number[];
      }
    >();

    for (const decision of decisions) {
      const data = decision.decision_data;
      if (!data || typeof data !== 'object') continue;

      // Extract channel from decision data
      const channel =
        (data.channel as string) ??
        (data.platform as string) ??
        (data.target as string) ??
        '';

      if (!channel) continue;

      const normalizedChannel = channel.toLowerCase();
      const existing = insights.get(normalizedChannel) ?? {
        recommendations: [],
        riskAssessments: [],
        scalingRecommendations: [],
        confidences: [],
      };

      // Collect recommendations
      if (data.recommendation && typeof data.recommendation === 'string') {
        existing.recommendations.push(data.recommendation);
      }
      if (data.reasoning && typeof data.reasoning === 'string') {
        existing.recommendations.push(data.reasoning);
      }

      // Collect risk assessments
      if (data.risk_level && typeof data.risk_level === 'string') {
        existing.riskAssessments.push(data.risk_level);
      }
      if (data.riskLevel && typeof data.riskLevel === 'string') {
        existing.riskAssessments.push(data.riskLevel);
      }

      // Collect scaling info
      if (
        data.scaling_potential &&
        typeof data.scaling_potential === 'string'
      ) {
        existing.scalingRecommendations.push(data.scaling_potential);
      }
      if (data.action && typeof data.action === 'string') {
        existing.scalingRecommendations.push(data.action);
      }

      // Collect confidence
      if (decision.confidence !== undefined && decision.confidence !== null) {
        existing.confidences.push(Number(decision.confidence));
      }

      insights.set(normalizedChannel, existing);
    }

    return insights;
  }

  /**
   * Builds the channel allocation matrix from aggregated metrics and insights.
   */
  static buildChannelMatrix(
    channelMetrics: Map<
      string,
      {
        totalSpend: number;
        totalRevenue: number;
        totalConversions: number;
        totalBudgetAllocated: number;
        countries: Set<string>;
      }
    >,
    agentInsights: Map<
      string,
      {
        recommendations: string[];
        riskAssessments: string[];
        scalingRecommendations: string[];
        confidences: number[];
      }
    >,
    totalBudget: number,
  ): ChannelAllocation[] {
    const matrix: ChannelAllocation[] = [];

    for (const [channelKey, metrics] of channelMetrics.entries()) {
      const displayName =
        SUPPORTED_CHANNELS.find((ch) => ch.toLowerCase() === channelKey) ??
        channelKey;

      // Compute budget allocation percentage
      const budgetAllocationPct =
        totalBudget > 0
          ? Math.round(
              (metrics.totalBudgetAllocated / totalBudget) * 100 * 100,
            ) / 100
          : 0;

      // Compute expected ROAS from historical data
      const expectedRoas =
        metrics.totalSpend > 0
          ? Math.round(
              (metrics.totalRevenue / metrics.totalSpend) * 100,
            ) / 100
          : 0;

      // Compute CAC estimate
      const cacEstimate =
        metrics.totalConversions > 0
          ? Math.round(
              (metrics.totalSpend / metrics.totalConversions) * 100,
            ) / 100
          : 0;

      // Get agent insights for this channel
      const insights = agentInsights.get(channelKey);

      // Determine priority level based on budget allocation and ROAS
      const priorityLevel =
        ChannelAllocationOutputService.determinePriorityLevel(
          budgetAllocationPct,
          expectedRoas,
        );

      // Determine scaling potential from agent insights or metrics
      const scalingPotential =
        ChannelAllocationOutputService.determineScalingPotential(
          insights,
          expectedRoas,
          metrics.totalConversions,
        );

      // Determine risk level from agent insights or performance data
      const riskLevel = ChannelAllocationOutputService.determineRiskLevel(
        insights,
        expectedRoas,
        metrics.totalSpend,
      );

      matrix.push({
        channel: displayName,
        budget_allocation_pct: budgetAllocationPct,
        expected_roas: expectedRoas,
        cac_estimate: cacEstimate,
        recommended_countries: Array.from(metrics.countries).sort(),
        priority_level: priorityLevel,
        scaling_potential: scalingPotential,
        risk_level: riskLevel,
      });
    }

    // Sort by budget allocation percentage descending
    matrix.sort((a, b) => b.budget_allocation_pct - a.budget_allocation_pct);

    return matrix;
  }

  /**
   * Builds per-country channel breakdowns from budget allocations and campaigns.
   */
  static buildCountryBreakdown(
    budgetAllocations: BudgetAllocationRow[],
    campaigns: CampaignRow[],
    countryLookup: Map<string, CountryRow>,
  ): CountryChannels[] {
    // Group campaigns by country
    const countryChannelMap = new Map<
      string,
      Map<string, { spend: number; conversions: number; budget: number }>
    >();

    // Aggregate from budget allocations
    for (const allocation of budgetAllocations) {
      const country = countryLookup.get(allocation.country_id);
      if (!country) continue;

      const channelAllocs = allocation.channel_allocations;
      if (!channelAllocs || typeof channelAllocs !== 'object') continue;

      let channels = countryChannelMap.get(country.code);
      if (!channels) {
        channels = new Map();
        countryChannelMap.set(country.code, channels);
      }

      for (const [channel, amount] of Object.entries(channelAllocs)) {
        const existing = channels.get(channel) ?? {
          spend: 0,
          conversions: 0,
          budget: 0,
        };
        existing.budget += Number(amount) || 0;
        channels.set(channel, existing);
      }
    }

    // Augment with campaign performance
    for (const campaign of campaigns) {
      const country = countryLookup.get(campaign.country_id);
      if (!country) continue;

      let channels = countryChannelMap.get(country.code);
      if (!channels) {
        channels = new Map();
        countryChannelMap.set(country.code, channels);
      }

      const existing = channels.get(campaign.platform) ?? {
        spend: 0,
        conversions: 0,
        budget: 0,
      };
      existing.spend += Number(campaign.spent) || 0;
      existing.conversions += Number(campaign.conversions) || 0;
      existing.budget += Number(campaign.budget) || 0;
      channels.set(campaign.platform, existing);
    }

    // Build output
    const result: CountryChannels[] = [];

    for (const [countryCode, channels] of countryChannelMap.entries()) {
      const totalBudget = Array.from(channels.values()).reduce(
        (sum, ch) => sum + ch.budget,
        0,
      );

      const channelEntries: CountryChannelEntry[] = [];

      for (const [channel, data] of channels.entries()) {
        channelEntries.push({
          channel,
          allocation_pct:
            totalBudget > 0
              ? Math.round((data.budget / totalBudget) * 100 * 100) / 100
              : 0,
          estimated_spend: Math.round(data.spend * 100) / 100,
          projected_conversions: data.conversions,
        });
      }

      // Sort by allocation percentage descending
      channelEntries.sort((a, b) => b.allocation_pct - a.allocation_pct);

      result.push({
        country_code: countryCode,
        channels: channelEntries,
      });
    }

    // Sort countries alphabetically
    result.sort((a, b) => a.country_code.localeCompare(b.country_code));

    return result;
  }

  // -----------------------------------------------------------------------
  // Classification helpers
  // -----------------------------------------------------------------------

  /**
   * Determines priority level based on budget allocation and ROAS.
   */
  static determinePriorityLevel(
    allocationPct: number,
    roas: number,
  ): 'critical' | 'high' | 'medium' | 'low' | 'experimental' {
    if (allocationPct >= 25 && roas >= 3) return 'critical';
    if (allocationPct >= 15 || roas >= 2.5) return 'high';
    if (allocationPct >= 8 || roas >= 1.5) return 'medium';
    if (allocationPct >= 3) return 'low';
    return 'experimental';
  }

  /**
   * Determines scaling potential from agent insights and performance.
   */
  static determineScalingPotential(
    insights:
      | {
          recommendations: string[];
          riskAssessments: string[];
          scalingRecommendations: string[];
          confidences: number[];
        }
      | undefined,
    roas: number,
    conversions: number,
  ): 'high' | 'medium' | 'low' {
    // Check if agent insights indicate scaling
    if (insights && insights.scalingRecommendations.length > 0) {
      const scaleActions = insights.scalingRecommendations.filter(
        (r) =>
          r.toLowerCase().includes('scale') ||
          r.toLowerCase().includes('increase'),
      );
      if (scaleActions.length > 0) return 'high';
    }

    // Fall back to ROAS and conversion-based assessment
    if (roas >= 3 && conversions >= 50) return 'high';
    if (roas >= 1.5 && conversions >= 20) return 'medium';
    return 'low';
  }

  /**
   * Determines risk level from agent insights and performance data.
   */
  static determineRiskLevel(
    insights:
      | {
          recommendations: string[];
          riskAssessments: string[];
          scalingRecommendations: string[];
          confidences: number[];
        }
      | undefined,
    roas: number,
    totalSpend: number,
  ): 'low' | 'medium' | 'high' {
    // Check agent risk assessments
    if (insights && insights.riskAssessments.length > 0) {
      const highRisk = insights.riskAssessments.filter(
        (r) => r.toLowerCase() === 'high',
      );
      if (highRisk.length > insights.riskAssessments.length / 2) return 'high';
    }

    // Performance-based risk assessment
    if (roas < 1 && totalSpend > 0) return 'high';
    if (roas < 2) return 'medium';
    return 'low';
  }

  /**
   * Computes an overall confidence score from agent decisions.
   */
  static computeConfidence(decisions: AgentDecisionRow[]): number {
    if (decisions.length === 0) return 0;

    const validConfidences = decisions
      .map((d) => Number(d.confidence))
      .filter((c) => !isNaN(c) && c >= 0 && c <= 1);

    if (validConfidences.length === 0) return 0;

    const avg =
      validConfidences.reduce((sum, c) => sum + c, 0) /
      validConfidences.length;

    return Math.round(avg * 100) / 100;
  }

  /**
   * Gathers optimization notes from agent decision data.
   */
  static gatherOptimizationNotes(decisions: AgentDecisionRow[]): string[] {
    const notes: string[] = [];
    const seen = new Set<string>();

    for (const decision of decisions) {
      const data = decision.decision_data;
      if (!data || typeof data !== 'object') continue;

      const noteFields = [
        'recommendation',
        'reasoning',
        'optimization_note',
        'note',
        'summary',
      ];

      for (const field of noteFields) {
        const value = data[field];
        if (typeof value === 'string' && value.length > 0 && !seen.has(value)) {
          seen.add(value);
          notes.push(value);
        }
      }
    }

    return notes;
  }
}

// ============================================================
// AI International Growth Engine - Competitive Intelligence Agent (Agent 14)
// Handles competitor monitoring, trend detection, and messaging gap analysis
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfig,
} from '../base/types';
import type {
  AgentType,
  Competitor,
  CompetitorMetric,
  GapAnalysis,
  TrendSignal,
} from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { NotFoundError, DatabaseError } from '../../utils/errors';

// ---- Local Types ----

export interface CompetitorAnalysis {
  competitorId: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
  estimatedSpend: number;
  marketShare: number;
  topChannels: string[];
  recentChanges: string[];
  threatLevel: 'low' | 'medium' | 'high';
}

export interface MonitoringReport {
  competitors: CompetitorAnalysis[];
  newEntrants: string[];
  exitedCompetitors: string[];
  significantChanges: string[];
  timestamp: string;
}

export interface MessagingGapAnalysis {
  competitorId: string;
  theirMessaging: string[];
  ourMessaging: string[];
  gaps: {
    area: string;
    theirApproach: string;
    ourApproach: string;
    opportunity: string;
  }[];
}

export interface SpendEstimate {
  competitorId: string;
  estimatedMonthlySpend: number;
  byChannel: Record<string, number>;
  confidence: number;
  methodology: string;
}

export interface CreativeIntelligence {
  competitorId: string;
  adCount: number;
  topFormats: string[];
  messagingThemes: string[];
  callToActions: string[];
  frequency: number;
}

export interface Opportunity {
  area: string;
  description: string;
  potentialImpact: number;
  effort: string;
  priority: number;
}

export interface CompetitiveReport {
  generatedAt: string;
  summary: string;
  competitors: CompetitorAnalysis[];
  trends: TrendSignal[];
  opportunities: Opportunity[];
  threats: string[];
  recommendations: string[];
}

export interface BenchmarkResult {
  metrics: Record<
    string,
    {
      ours: number;
      industryAvg: number;
      bestInClass: number;
      percentile: number;
    }
  >;
  overallScore: number;
}

// ---- Cache Keys & TTLs ----

const CACHE_PREFIX = 'competitive_intel';
const CACHE_TTL_COMPETITOR_ANALYSIS = 1800; // 30 minutes
const CACHE_TTL_MONITORING_REPORT = 900; // 15 minutes
const CACHE_TTL_TRENDS = 600; // 10 minutes
const CACHE_TTL_BENCHMARK = 3600; // 1 hour

// ---- Agent Implementation ----

/**
 * Agent 14 - Competitive Intelligence Agent
 *
 * Monitors competitors across digital channels, detects market trends,
 * identifies messaging gaps, and surfaces strategic opportunities.
 * Uses AI analysis to synthesize insights from competitor data and
 * produce actionable intelligence for the growth engine.
 *
 * Challenge targets: market_intelligence, country_strategy, paid_ads
 */
export class CompetitiveIntelAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'competitive_intelligence',
      model: 'opus',
      maxRetries: 3,
      timeoutMs: 120000,
      confidenceThreshold: 60,
      ...config,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  getChallengeTargets(): AgentType[] {
    return ['market_intelligence', 'country_strategy', 'paid_ads'];
  }

  getSystemPrompt(): string {
    return `You are the Competitive Intelligence Agent for an AI-powered international growth engine.
Your role is to analyse competitor data, detect market trends, identify messaging gaps,
and produce strategic competitive intelligence.

You MUST:
- Base all analysis on provided data; never fabricate metrics or competitor information
- Clearly flag uncertainty when data is incomplete or outdated
- Provide confidence scores that reflect actual data quality and coverage
- Identify both threats and opportunities from competitive dynamics
- Consider regional and platform-specific variations in competitor strategy
- Quantify impact estimates with explicit methodology and confidence ranges

Response format: Return valid JSON matching the requested schema.
Never return placeholder or example data. If data is insufficient, say so explicitly.`;
  }

  /**
   * Core processing entrypoint. Orchestrates competitor monitoring,
   * trend detection, and gap analysis based on the input parameters.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing competitive intelligence request', {
      requestId: input.requestId,
      action: input.parameters.action,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      const action = (input.parameters.action as string) || 'full_report';

      let data: Record<string, unknown> = {};
      let decision: string;

      switch (action) {
        case 'monitor': {
          const report = await this.monitorCompetitors();
          data = { monitoringReport: report };
          decision = `Monitoring complete: ${report.competitors.length} competitors tracked, ${report.significantChanges.length} significant changes detected`;

          if (report.newEntrants.length > 0) {
            warnings.push(
              `New market entrants detected: ${report.newEntrants.join(', ')}`,
            );
          }
          if (report.significantChanges.length > 0) {
            recommendations.push(
              'Review significant competitor changes and adjust strategy accordingly',
            );
          }
          break;
        }

        case 'analyze_competitor': {
          const competitorId = input.parameters.competitorId as string;
          if (!competitorId) {
            throw new Error('competitorId parameter is required for analyze_competitor action');
          }
          const analysis = await this.analyzeCompetitor(competitorId);
          data = { competitorAnalysis: analysis };
          decision = `Competitor analysis complete for ${analysis.name}: threat level is ${analysis.threatLevel}`;

          if (analysis.threatLevel === 'high') {
            warnings.push(
              `High threat competitor: ${analysis.name} - immediate attention recommended`,
            );
          }
          break;
        }

        case 'detect_trends': {
          const timeWindow = (input.parameters.timeWindow as string) || '30d';
          const trends = await this.detectTrends(timeWindow);
          data = { trends };
          decision = `Trend detection complete: ${trends.length} signals identified in ${timeWindow} window`;

          const highConfidenceTrends = trends.filter((t) => t.confidence >= 0.8);
          if (highConfidenceTrends.length > 0) {
            recommendations.push(
              `${highConfidenceTrends.length} high-confidence trends warrant strategic response`,
            );
          }
          break;
        }

        case 'gap_analysis': {
          const competitorId = input.parameters.competitorId as string;
          if (!competitorId) {
            throw new Error('competitorId parameter is required for gap_analysis action');
          }
          const gapAnalysis = await this.performGapAnalysis(competitorId);
          const opportunities = this.identifyOpportunities(gapAnalysis);
          data = { gapAnalysis, opportunities };
          decision = `Gap analysis complete: ${gapAnalysis.gaps.length} gaps identified, ${opportunities.length} opportunities found`;

          const highImpactOpps = opportunities.filter((o) => o.potentialImpact >= 7);
          if (highImpactOpps.length > 0) {
            recommendations.push(
              `${highImpactOpps.length} high-impact opportunities should be prioritised`,
            );
          }
          break;
        }

        case 'full_report':
        default: {
          const report = await this.generateCompetitiveReport();
          data = { competitiveReport: report };
          decision = `Full competitive report generated: ${report.competitors.length} competitors, ${report.trends.length} trends, ${report.opportunities.length} opportunities`;

          recommendations.push(...report.recommendations);
          if (report.threats.length > 0) {
            warnings.push(...report.threats.map((t) => `Threat: ${t}`));
          }
          break;
        }
      }

      // Calculate confidence based on data quality factors
      const competitorCount = await this.getTrackedCompetitorCount();
      const dataRecency = await this.assessDataRecency();

      const confidence = this.calculateConfidence({
        data_availability: competitorCount > 0 ? Math.min(100, competitorCount * 20) : 0,
        data_recency: dataRecency,
        analysis_depth: action === 'full_report' ? 80 : 65,
      });

      if (competitorCount === 0) {
        uncertainties.push(
          this.flagUncertainty(
            'competitor_data',
            'No competitor records found in database; analysis is based on limited data',
          ),
        );
      }

      if (dataRecency < 50) {
        uncertainties.push(
          this.flagUncertainty(
            'data_recency',
            'Competitor data may be stale; last analysis timestamps exceed recommended freshness window',
          ),
        );
      }

      const output = this.buildOutput(
        decision,
        data,
        confidence,
        `Competitive intelligence analysis performed using ${action} strategy across ${competitorCount} tracked competitors.`,
        recommendations,
        warnings,
        uncertainties,
      );

      await this.logDecision(input, output);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Competitive intelligence processing failed', {
        requestId: input.requestId,
        error: message,
      });

      const failureConfidence = this.calculateConfidence({
        data_availability: 0,
        data_recency: 0,
        analysis_depth: 0,
      });

      return this.buildOutput(
        'analysis_failed',
        { error: message },
        failureConfidence,
        `Competitive intelligence analysis failed: ${message}`,
        ['Investigate data source connectivity and retry'],
        [`Processing error: ${message}`],
        [
          this.flagUncertainty('processing', 'Analysis could not be completed due to an error'),
        ],
      );
    }
  }

  // ------------------------------------------------------------------
  // Public domain methods
  // ------------------------------------------------------------------

  /**
   * Performs a deep analysis of a single competitor, synthesising database
   * records with AI-powered assessment of strengths, weaknesses, and threat level.
   */
  async analyzeCompetitor(competitorId: string): Promise<CompetitorAnalysis> {
    this.log.info('Analysing competitor', { competitorId });

    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:analysis:${competitorId}`;
    const cached = await cacheGet<CompetitorAnalysis>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached competitor analysis', { competitorId });
      return cached;
    }

    // Fetch competitor from database
    const competitor = await this.fetchCompetitor(competitorId);

    // Use AI to produce a structured competitor analysis
    const prompt = `Analyse the following competitor data and produce a structured competitive assessment.
Competitor: ${competitor.name}
Website: ${competitor.website}
Platforms: ${JSON.stringify(competitor.platforms)}
Metrics: ${JSON.stringify(competitor.metrics)}
Last Analysed: ${competitor.last_analyzed_at || 'never'}

Produce a JSON object with:
- strengths: string[] (based on their metrics and platform presence)
- weaknesses: string[] (gaps or underperformance in data)
- topChannels: string[] (their strongest channels)
- recentChanges: string[] (inferred from data patterns)
- threatLevel: "low" | "medium" | "high" (based on market share and spend)

Base ALL conclusions on the provided data. If data is insufficient for a field, return an empty array and note the limitation.`;

    let aiResult: {
      strengths: string[];
      weaknesses: string[];
      topChannels: string[];
      recentChanges: string[];
      threatLevel: 'low' | 'medium' | 'high';
    };

    try {
      const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
      aiResult = JSON.parse(aiResponse);
    } catch {
      this.log.warn('AI analysis unavailable, falling back to rule-based analysis', {
        competitorId,
      });
      aiResult = this.ruleBasedCompetitorAssessment(competitor);
    }

    const analysis: CompetitorAnalysis = {
      competitorId,
      name: competitor.name,
      strengths: aiResult.strengths || [],
      weaknesses: aiResult.weaknesses || [],
      estimatedSpend: competitor.metrics.estimated_spend ?? 0,
      marketShare: competitor.metrics.market_share ?? 0,
      topChannels: aiResult.topChannels || [],
      recentChanges: aiResult.recentChanges || [],
      threatLevel: aiResult.threatLevel || this.assessThreatLevel(competitor.metrics),
    };

    await cacheSet(cacheKey, analysis, CACHE_TTL_COMPETITOR_ANALYSIS);
    return analysis;
  }

  /**
   * Monitors all tracked competitors and produces a consolidated report
   * highlighting new entrants, exits, and significant strategic changes.
   */
  async monitorCompetitors(): Promise<MonitoringReport> {
    this.log.info('Running competitor monitoring cycle');

    const cacheKey = `${CACHE_PREFIX}:monitoring_report`;
    const cached = await cacheGet<MonitoringReport>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached monitoring report');
      return cached;
    }

    const competitors = await this.fetchAllCompetitors();
    const previousState = await this.loadState();
    const previousCompetitorIds = (previousState?.trackedCompetitorIds as string[]) || [];

    const currentIds = competitors.map((c) => c.id);
    const newEntrants = currentIds.filter((id) => !previousCompetitorIds.includes(id));
    const exitedCompetitors = previousCompetitorIds.filter(
      (id) => !currentIds.includes(id),
    );

    // Analyse each competitor
    const analyses: CompetitorAnalysis[] = [];
    for (const competitor of competitors) {
      try {
        const analysis = await this.analyzeCompetitor(competitor.id);
        analyses.push(analysis);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.warn('Failed to analyse competitor during monitoring', {
          competitorId: competitor.id,
          error: message,
        });
      }
    }

    // Detect significant changes by comparing with previous metrics
    const significantChanges = await this.detectSignificantChanges(
      competitors,
      previousState,
    );

    const report: MonitoringReport = {
      competitors: analyses,
      newEntrants: await this.resolveCompetitorNames(newEntrants),
      exitedCompetitors: await this.resolveCompetitorNames(exitedCompetitors),
      significantChanges,
      timestamp: new Date().toISOString(),
    };

    // Persist current state for next comparison
    await this.persistState({
      trackedCompetitorIds: currentIds,
      competitorMetrics: Object.fromEntries(
        competitors.map((c) => [c.id, c.metrics]),
      ),
      lastMonitoringRun: new Date().toISOString(),
    });

    await cacheSet(cacheKey, report, CACHE_TTL_MONITORING_REPORT);
    return report;
  }

  /**
   * Detects market and competitive trends within the specified time window.
   * Queries the trend_signals table and augments findings with AI analysis.
   */
  async detectTrends(timeWindow: string): Promise<TrendSignal[]> {
    this.log.info('Detecting trends', { timeWindow });

    const cacheKey = `${CACHE_PREFIX}:trends:${timeWindow}`;
    const cached = await cacheGet<TrendSignal[]>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached trends', { timeWindow });
      return cached;
    }

    const windowDays = this.parseTimeWindow(timeWindow);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    let dbTrends: TrendSignal[] = [];

    try {
      const result = await pool.query<TrendSignal>(
        `SELECT id, source, signal_type, description, confidence, detected_at
         FROM trend_signals
         WHERE detected_at >= $1
         ORDER BY confidence DESC, detected_at DESC`,
        [cutoffDate.toISOString()],
      );
      dbTrends = result.rows;
    } catch (error) {
      this.log.warn('Failed to query trend_signals table, attempting AI-based detection', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // If we have competitor data, attempt AI-augmented trend detection
    const competitors = await this.fetchAllCompetitors();
    if (competitors.length > 0) {
      try {
        const prompt = `Analyse the following competitor landscape data and identify market trends.
Time window: last ${windowDays} days
Competitors: ${JSON.stringify(
          competitors.map((c) => ({
            name: c.name,
            platforms: c.platforms,
            metrics: c.metrics,
            lastAnalysed: c.last_analyzed_at,
          })),
        )}

Existing detected trends: ${JSON.stringify(dbTrends.map((t) => t.description))}

Return a JSON array of trend objects with: { signal_type: string, description: string, confidence: number (0-1) }
Only return trends supported by the data. Do NOT fabricate trends.`;

        const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
        const aiTrends: Array<{
          signal_type: string;
          description: string;
          confidence: number;
        }> = JSON.parse(aiResponse);

        const now = new Date().toISOString();
        for (const aiTrend of aiTrends) {
          const isDuplicate = dbTrends.some(
            (existing) =>
              existing.description.toLowerCase() === aiTrend.description.toLowerCase(),
          );

          if (!isDuplicate) {
            dbTrends.push({
              id: generateId(),
              source: 'ai_analysis',
              signal_type: aiTrend.signal_type,
              description: aiTrend.description,
              confidence: Math.max(0, Math.min(1, aiTrend.confidence)),
              detected_at: now,
            });
          }
        }
      } catch {
        this.log.warn('AI trend augmentation unavailable, using database trends only');
      }
    }

    // Sort by confidence descending
    dbTrends.sort((a, b) => b.confidence - a.confidence);

    await cacheSet(cacheKey, dbTrends, CACHE_TTL_TRENDS);
    return dbTrends;
  }

  /**
   * Performs a gap analysis comparing our performance against a specific competitor
   * across key strategic dimensions.
   */
  async performGapAnalysis(competitorId: string): Promise<GapAnalysis> {
    this.log.info('Performing gap analysis', { competitorId });

    const competitor = await this.fetchCompetitor(competitorId);
    const ourMetrics = await this.fetchOurMetrics();

    const gaps: GapAnalysis['gaps'] = [];

    // Compare spend
    if (competitor.metrics.estimated_spend !== undefined) {
      const ourSpend = ourMetrics.totalSpend ?? 0;
      const theirSpend = competitor.metrics.estimated_spend;
      gaps.push({
        area: 'advertising_spend',
        our_score: this.normalizeMetric(ourSpend, theirSpend),
        their_score: this.normalizeMetric(theirSpend, ourSpend),
        opportunity:
          ourSpend < theirSpend
            ? `Competitor outspends by ${Math.round(((theirSpend - ourSpend) / Math.max(ourSpend, 1)) * 100)}%. Evaluate budget increase or efficiency improvements.`
            : `We outspend competitor by ${Math.round(((ourSpend - theirSpend) / Math.max(theirSpend, 1)) * 100)}%. Focus on maintaining efficiency advantage.`,
      });
    }

    // Compare market share
    if (competitor.metrics.market_share !== undefined) {
      const ourShare = ourMetrics.marketShare ?? 0;
      const theirShare = competitor.metrics.market_share;
      gaps.push({
        area: 'market_share',
        our_score: ourShare,
        their_score: theirShare,
        opportunity:
          ourShare < theirShare
            ? `Market share gap of ${(theirShare - ourShare).toFixed(1)}pp. Target competitor\'s weaker segments.`
            : `Market share lead of ${(ourShare - theirShare).toFixed(1)}pp. Defend position and expand into adjacent segments.`,
      });
    }

    // Compare creative volume
    if (competitor.metrics.creative_count !== undefined) {
      const ourCreativeCount = ourMetrics.creativeCount ?? 0;
      const theirCreativeCount = competitor.metrics.creative_count;
      gaps.push({
        area: 'creative_volume',
        our_score: this.normalizeMetric(ourCreativeCount, theirCreativeCount),
        their_score: this.normalizeMetric(theirCreativeCount, ourCreativeCount),
        opportunity:
          ourCreativeCount < theirCreativeCount
            ? `Competitor has ${theirCreativeCount - ourCreativeCount} more active creatives. Increase creative production velocity.`
            : `Creative volume advantage of ${ourCreativeCount - theirCreativeCount} assets. Maintain refresh cadence.`,
      });
    }

    // Compare ad frequency
    if (competitor.metrics.ad_frequency !== undefined) {
      const ourFrequency = ourMetrics.adFrequency ?? 0;
      const theirFrequency = competitor.metrics.ad_frequency;
      gaps.push({
        area: 'ad_frequency',
        our_score: this.normalizeMetric(ourFrequency, theirFrequency),
        their_score: this.normalizeMetric(theirFrequency, ourFrequency),
        opportunity:
          theirFrequency > ourFrequency
            ? `Competitor has higher ad frequency. Evaluate if increased frequency would improve reach without fatigue.`
            : `Our ad frequency is higher. Monitor for creative fatigue and optimise rotation.`,
      });
    }

    // Augment with AI if enough data exists
    if (gaps.length >= 2) {
      try {
        const prompt = `Given the following competitive gaps, suggest additional strategic areas to examine.
Competitor: ${competitor.name}
Current gaps: ${JSON.stringify(gaps)}

Return a JSON array of additional gap objects with: { area: string, our_score: number (0-100), their_score: number (0-100), opportunity: string }
Only suggest gaps that are logically derivable from the data. Do not fabricate scores.`;

        const aiResponse = await this.callAI(this.getSystemPrompt(), prompt, 'sonnet');
        const additionalGaps: GapAnalysis['gaps'] = JSON.parse(aiResponse);
        gaps.push(
          ...additionalGaps.filter(
            (g) => !gaps.some((existing) => existing.area === g.area),
          ),
        );
      } catch {
        this.log.debug('AI gap augmentation unavailable');
      }
    }

    const gapAnalysis: GapAnalysis = {
      competitor_id: competitorId,
      gaps,
      generated_at: new Date().toISOString(),
    };

    return gapAnalysis;
  }

  /**
   * Analyses messaging differences between our content and a competitor's,
   * identifying thematic gaps and opportunities for differentiation.
   */
  async analyzeMessagingGaps(competitorId: string): Promise<MessagingGapAnalysis> {
    this.log.info('Analysing messaging gaps', { competitorId });

    const competitor = await this.fetchCompetitor(competitorId);
    const ourCreatives = await this.fetchOurCreatives();
    const competitorCreatives = await this.fetchCompetitorCreatives(competitorId);

    const ourMessaging = ourCreatives.map((c) => c.content).filter(Boolean);
    const theirMessaging = competitorCreatives.map((c) => c.content).filter(Boolean);

    let gaps: MessagingGapAnalysis['gaps'] = [];

    try {
      const prompt = `Compare the following messaging sets and identify gaps.
Our messaging themes: ${JSON.stringify(ourMessaging.slice(0, 20))}
Their messaging themes: ${JSON.stringify(theirMessaging.slice(0, 20))}
Competitor: ${competitor.name}

Return a JSON object with:
{
  "gaps": [{ "area": string, "theirApproach": string, "ourApproach": string, "opportunity": string }]
}

Base analysis strictly on the provided content. Flag areas where data is insufficient.`;

      const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
      const parsed = JSON.parse(aiResponse);
      gaps = parsed.gaps || [];
    } catch {
      this.log.warn('AI messaging gap analysis unavailable, returning structural comparison');

      // Fallback: structural comparison
      if (theirMessaging.length > 0 && ourMessaging.length === 0) {
        gaps.push({
          area: 'content_presence',
          theirApproach: `${theirMessaging.length} active creative messages`,
          ourApproach: 'No active creative messages found',
          opportunity: 'Develop competitive messaging to establish market presence',
        });
      }
    }

    return {
      competitorId,
      theirMessaging: theirMessaging.slice(0, 50),
      ourMessaging: ourMessaging.slice(0, 50),
      gaps,
    };
  }

  /**
   * Estimates a competitor's advertising spend using available metrics,
   * ad frequency data, and platform cost benchmarks.
   */
  async estimateCompetitorSpend(competitorId: string): Promise<SpendEstimate> {
    this.log.info('Estimating competitor spend', { competitorId });

    const competitor = await this.fetchCompetitor(competitorId);
    const metrics = competitor.metrics;

    const byChannel: Record<string, number> = {};
    let totalEstimate = 0;
    let methodologyNotes: string[] = [];
    let dataPointCount = 0;

    // Use known estimated_spend if available
    if (metrics.estimated_spend !== undefined && metrics.estimated_spend > 0) {
      totalEstimate = metrics.estimated_spend;
      methodologyNotes.push('Direct estimated spend data available from competitor record');
      dataPointCount++;
    }

    // Estimate by platform if platform data is available
    if (competitor.platforms && typeof competitor.platforms === 'object') {
      const platformEntries = Object.entries(competitor.platforms);
      for (const [platform, platformData] of platformEntries) {
        if (platformData && typeof platformData === 'object') {
          const data = platformData as Record<string, unknown>;
          const platformSpend =
            typeof data.estimated_spend === 'number' ? data.estimated_spend : 0;
          if (platformSpend > 0) {
            byChannel[platform] = platformSpend;
            dataPointCount++;
          }
        }
      }
    }

    // If we have per-channel data but no total, sum the channels
    const channelTotal = Object.values(byChannel).reduce((sum, v) => sum + v, 0);
    if (channelTotal > 0 && totalEstimate === 0) {
      totalEstimate = channelTotal;
      methodologyNotes.push('Total estimated from sum of per-channel estimates');
    }

    // Estimate from ad frequency and creative count if direct spend is unavailable
    if (totalEstimate === 0 && metrics.ad_frequency && metrics.creative_count) {
      // Rough heuristic: frequency * creative count * platform average CPM
      // This is flagged as low confidence
      const estimatedImpressions = metrics.ad_frequency * metrics.creative_count * 1000;
      // Fetch average CPM from our campaign data
      const avgCpm = await this.fetchAverageCPM();
      if (avgCpm > 0) {
        totalEstimate = (estimatedImpressions / 1000) * avgCpm;
        methodologyNotes.push(
          'Estimated from ad frequency, creative count, and average market CPM. Low confidence heuristic.',
        );
        dataPointCount++;
      }
    }

    const confidence = Math.min(
      100,
      dataPointCount * 25 + (totalEstimate > 0 ? 15 : 0),
    );

    if (methodologyNotes.length === 0) {
      methodologyNotes.push(
        'Insufficient data for spend estimation. No direct or indirect signals available.',
      );
    }

    return {
      competitorId,
      estimatedMonthlySpend: Math.round(totalEstimate * 100) / 100,
      byChannel,
      confidence,
      methodology: methodologyNotes.join(' | '),
    };
  }

  /**
   * Tracks and analyses a competitor's creative assets, ad formats,
   * messaging themes, and call-to-action patterns.
   */
  async trackCompetitorCreatives(
    competitorId: string,
  ): Promise<CreativeIntelligence> {
    this.log.info('Tracking competitor creatives', { competitorId });

    const competitor = await this.fetchCompetitor(competitorId);
    const creatives = await this.fetchCompetitorCreatives(competitorId);

    const adCount = creatives.length;
    const topFormats: string[] = [];
    const messagingThemes: string[] = [];
    const callToActions: string[] = [];

    // Extract format distribution
    const formatCounts: Record<string, number> = {};
    for (const creative of creatives) {
      const format = (creative.type as string) || 'unknown';
      formatCounts[format] = (formatCounts[format] || 0) + 1;
    }
    const sortedFormats = Object.entries(formatCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([format]) => format);
    topFormats.push(...sortedFormats.slice(0, 5));

    // Use AI to extract messaging themes and CTAs if content is available
    const contentSamples = creatives
      .map((c) => c.content)
      .filter(Boolean)
      .slice(0, 30);

    if (contentSamples.length > 0) {
      try {
        const prompt = `Analyse the following ad creatives from competitor "${competitor.name}" and extract:
1. messagingThemes: main themes/value propositions used (string[])
2. callToActions: distinct call-to-action phrases used (string[])

Creative content samples: ${JSON.stringify(contentSamples)}

Return JSON: { "messagingThemes": string[], "callToActions": string[] }
Only extract themes and CTAs actually present in the data.`;

        const aiResponse = await this.callAI(this.getSystemPrompt(), prompt, 'sonnet');
        const parsed = JSON.parse(aiResponse);
        messagingThemes.push(...(parsed.messagingThemes || []));
        callToActions.push(...(parsed.callToActions || []));
      } catch {
        this.log.warn('AI creative analysis unavailable');
      }
    }

    return {
      competitorId,
      adCount,
      topFormats,
      messagingThemes,
      callToActions,
      frequency: competitor.metrics.ad_frequency ?? 0,
    };
  }

  /**
   * Transforms a gap analysis into a prioritised list of actionable opportunities.
   * Uses a scoring model based on the magnitude of gaps and estimated effort.
   */
  identifyOpportunities(gapAnalysis: GapAnalysis): Opportunity[] {
    const opportunities: Opportunity[] = [];

    for (const gap of gapAnalysis.gaps) {
      const scoreDifference = gap.their_score - gap.our_score;

      // Only surface opportunities where the competitor has a meaningful advantage
      // or where we have potential to differentiate
      if (Math.abs(scoreDifference) < 5) {
        continue;
      }

      const isTheirAdvantage = scoreDifference > 0;
      const magnitude = Math.abs(scoreDifference);

      // Estimate effort based on gap area
      const effort = this.estimateEffort(gap.area, magnitude);

      // Calculate potential impact (0-10 scale)
      const potentialImpact = Math.min(10, Math.round(magnitude / 10));

      // Priority scoring: high impact + low effort = high priority
      const effortWeight =
        effort === 'low' ? 3 : effort === 'medium' ? 2 : 1;
      const priority = Math.round(
        (potentialImpact * effortWeight) / 3,
      );

      opportunities.push({
        area: gap.area,
        description: isTheirAdvantage
          ? `Close gap in ${gap.area}: ${gap.opportunity}`
          : `Extend advantage in ${gap.area}: ${gap.opportunity}`,
        potentialImpact,
        effort,
        priority: Math.min(10, priority),
      });
    }

    // Sort by priority descending
    opportunities.sort((a, b) => b.priority - a.priority);

    return opportunities;
  }

  /**
   * Generates a comprehensive competitive intelligence report covering
   * all tracked competitors, detected trends, and strategic recommendations.
   */
  async generateCompetitiveReport(): Promise<CompetitiveReport> {
    this.log.info('Generating comprehensive competitive report');

    const competitors = await this.fetchAllCompetitors();
    const analyses: CompetitorAnalysis[] = [];
    const allOpportunities: Opportunity[] = [];
    const allThreats: string[] = [];

    for (const competitor of competitors) {
      try {
        const analysis = await this.analyzeCompetitor(competitor.id);
        analyses.push(analysis);

        if (analysis.threatLevel === 'high') {
          allThreats.push(
            `${analysis.name}: High threat competitor with ${analysis.marketShare}% market share`,
          );
        }

        // Perform gap analysis and extract opportunities
        try {
          const gapAnalysis = await this.performGapAnalysis(competitor.id);
          const opps = this.identifyOpportunities(gapAnalysis);
          allOpportunities.push(...opps);
        } catch {
          this.log.debug('Gap analysis unavailable for competitor', {
            competitorId: competitor.id,
          });
        }
      } catch (error) {
        this.log.warn('Failed to analyse competitor for report', {
          competitorId: competitor.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const trends = await this.detectTrends('30d');

    // Deduplicate and rank opportunities
    const uniqueOpportunities = this.deduplicateOpportunities(allOpportunities);

    // Generate summary and recommendations using AI
    let summary = `Competitive report covering ${analyses.length} competitors with ${trends.length} detected trends and ${uniqueOpportunities.length} opportunities.`;
    let recommendations: string[] = [];

    try {
      const prompt = `Produce a strategic summary and recommendations for the following competitive landscape.

Competitor analyses: ${JSON.stringify(analyses.map((a) => ({ name: a.name, threatLevel: a.threatLevel, marketShare: a.marketShare, strengths: a.strengths, weaknesses: a.weaknesses })))}

Trends: ${JSON.stringify(trends.map((t) => ({ type: t.signal_type, description: t.description, confidence: t.confidence })))}

Opportunities: ${JSON.stringify(uniqueOpportunities.slice(0, 10))}

Threats: ${JSON.stringify(allThreats)}

Return JSON: { "summary": string (2-3 sentences), "recommendations": string[] (3-7 actionable items) }
Base all recommendations on the provided data.`;

      const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
      const parsed = JSON.parse(aiResponse);
      summary = parsed.summary || summary;
      recommendations = parsed.recommendations || [];
    } catch {
      this.log.warn('AI report generation unavailable, using structured summary');
      if (allThreats.length > 0) {
        recommendations.push('Address high-threat competitors with targeted campaigns');
      }
      if (uniqueOpportunities.length > 0) {
        recommendations.push(
          `Prioritise top ${Math.min(3, uniqueOpportunities.length)} opportunities for immediate action`,
        );
      }
      if (trends.length > 0) {
        recommendations.push('Align strategy with detected market trends');
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      summary,
      competitors: analyses,
      trends,
      opportunities: uniqueOpportunities,
      threats: allThreats,
      recommendations,
    };
  }

  /**
   * Benchmarks our performance metrics against industry averages and
   * best-in-class competitors to determine competitive positioning.
   */
  async benchmarkPerformance(
    metrics: Record<string, number>,
  ): Promise<BenchmarkResult> {
    this.log.info('Benchmarking performance', {
      metricCount: Object.keys(metrics).length,
    });

    const cacheKey = `${CACHE_PREFIX}:benchmark:${Object.keys(metrics).sort().join(',')}`;
    const cached = await cacheGet<BenchmarkResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const competitors = await this.fetchAllCompetitors();
    const benchmarkMetrics: BenchmarkResult['metrics'] = {};

    for (const [metricName, ourValue] of Object.entries(metrics)) {
      const competitorValues = this.extractCompetitorMetricValues(
        competitors,
        metricName,
      );

      if (competitorValues.length === 0) {
        benchmarkMetrics[metricName] = {
          ours: ourValue,
          industryAvg: 0,
          bestInClass: 0,
          percentile: 50, // default when no comparison data
        };
        continue;
      }

      const industryAvg =
        competitorValues.reduce((sum, v) => sum + v, 0) / competitorValues.length;
      const bestInClass = Math.max(...competitorValues);
      const allValues = [...competitorValues, ourValue].sort((a, b) => a - b);
      const ourRank = allValues.indexOf(ourValue) + 1;
      const percentile = Math.round((ourRank / allValues.length) * 100);

      benchmarkMetrics[metricName] = {
        ours: ourValue,
        industryAvg: Math.round(industryAvg * 100) / 100,
        bestInClass,
        percentile,
      };
    }

    // Calculate overall score as weighted average of percentiles
    const percentiles = Object.values(benchmarkMetrics).map((m) => m.percentile);
    const overallScore =
      percentiles.length > 0
        ? Math.round(
            (percentiles.reduce((sum, p) => sum + p, 0) / percentiles.length) *
              100,
          ) / 100
        : 50;

    const result: BenchmarkResult = {
      metrics: benchmarkMetrics,
      overallScore,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_BENCHMARK);
    return result;
  }

  // ------------------------------------------------------------------
  // Private helpers - Database queries
  // ------------------------------------------------------------------

  /**
   * Fetches a single competitor record by ID.
   * @throws NotFoundError if no competitor exists with the given ID.
   */
  private async fetchCompetitor(competitorId: string): Promise<Competitor> {
    try {
      const result = await pool.query<Competitor>(
        `SELECT id, name, website, platforms, metrics, last_analyzed_at, created_at, updated_at
         FROM competitors
         WHERE id = $1
         LIMIT 1`,
        [competitorId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Competitor not found: ${competitorId}`);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      this.log.error('Failed to fetch competitor', { competitorId, error });
      throw new DatabaseError(
        `Failed to fetch competitor ${competitorId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Fetches all tracked competitors from the database.
   */
  private async fetchAllCompetitors(): Promise<Competitor[]> {
    try {
      const result = await pool.query<Competitor>(
        `SELECT id, name, website, platforms, metrics, last_analyzed_at, created_at, updated_at
         FROM competitors
         ORDER BY name ASC`,
      );
      return result.rows;
    } catch (error) {
      this.log.error('Failed to fetch competitors', { error });
      throw new DatabaseError(
        `Failed to fetch competitors: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the count of tracked competitors.
   */
  private async getTrackedCompetitorCount(): Promise<number> {
    try {
      const result = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM competitors',
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch {
      this.log.warn('Could not query competitor count');
      return 0;
    }
  }

  /**
   * Assesses the recency of competitor data.
   * Returns a score 0-100 where 100 means all data is fresh (< 24h).
   */
  private async assessDataRecency(): Promise<number> {
    try {
      const result = await pool.query<{ avg_hours: number }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (NOW() - last_analyzed_at)) / 3600) AS avg_hours
         FROM competitors
         WHERE last_analyzed_at IS NOT NULL`,
      );

      const avgHours = result.rows[0]?.avg_hours;
      if (avgHours === null || avgHours === undefined) return 0;

      // Score: 100 if < 1h old, decreasing to 0 at 168h (7 days)
      return Math.max(0, Math.min(100, Math.round(100 - (avgHours / 168) * 100)));
    } catch {
      this.log.warn('Could not assess data recency');
      return 0;
    }
  }

  /**
   * Fetches our own aggregated performance metrics for comparison.
   */
  private async fetchOurMetrics(): Promise<{
    totalSpend: number;
    marketShare: number;
    creativeCount: number;
    adFrequency: number;
  }> {
    try {
      const spendResult = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(spent), 0) AS total FROM campaigns WHERE status = 'active'`,
      );
      const creativeResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM creatives WHERE is_active = true`,
      );

      return {
        totalSpend: parseFloat(spendResult.rows[0]?.total || '0'),
        marketShare: 0, // Market share requires external data; flagged as unknown
        creativeCount: parseInt(creativeResult.rows[0]?.count || '0', 10),
        adFrequency: 0, // Frequency requires impression data over time
      };
    } catch {
      this.log.warn('Could not fetch our metrics, using defaults');
      return {
        totalSpend: 0,
        marketShare: 0,
        creativeCount: 0,
        adFrequency: 0,
      };
    }
  }

  /**
   * Fetches our active creative content for messaging comparison.
   */
  private async fetchOurCreatives(): Promise<
    Array<{ content: string; type: string }>
  > {
    try {
      const result = await pool.query<{ content: string; type: string }>(
        `SELECT content, type FROM creatives WHERE is_active = true ORDER BY created_at DESC LIMIT 100`,
      );
      return result.rows;
    } catch {
      this.log.warn('Could not fetch our creatives');
      return [];
    }
  }

  /**
   * Fetches known creative data associated with a competitor.
   * Uses the competitor_creatives table if it exists, or extracts from platforms data.
   */
  private async fetchCompetitorCreatives(
    competitorId: string,
  ): Promise<Array<{ content: string; type: string }>> {
    try {
      // Attempt to query a dedicated competitor_creatives table
      const result = await pool.query<{ content: string; type: string }>(
        `SELECT content, type FROM competitor_creatives
         WHERE competitor_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [competitorId],
      );
      return result.rows;
    } catch {
      // Table may not exist; fall back to platform data on competitor record
      this.log.debug(
        'competitor_creatives table not available, extracting from competitor platforms data',
      );
      try {
        const competitor = await this.fetchCompetitor(competitorId);
        const creatives: Array<{ content: string; type: string }> = [];

        if (competitor.platforms && typeof competitor.platforms === 'object') {
          for (const [, platformData] of Object.entries(competitor.platforms)) {
            if (platformData && typeof platformData === 'object') {
              const data = platformData as Record<string, unknown>;
              if (Array.isArray(data.creatives)) {
                for (const c of data.creatives) {
                  if (typeof c === 'object' && c !== null) {
                    creatives.push({
                      content: String((c as Record<string, unknown>).content || ''),
                      type: String((c as Record<string, unknown>).type || 'unknown'),
                    });
                  }
                }
              }
            }
          }
        }

        return creatives;
      } catch {
        return [];
      }
    }
  }

  /**
   * Fetches the average CPM across our active campaigns for spend estimation.
   */
  private async fetchAverageCPM(): Promise<number> {
    try {
      const result = await pool.query<{ avg_cpm: string }>(
        `SELECT AVG(
           CASE WHEN metrics->>'impressions' IS NOT NULL AND (metrics->>'impressions')::numeric > 0
             THEN (metrics->>'spend')::numeric / ((metrics->>'impressions')::numeric / 1000)
             ELSE NULL
           END
         ) AS avg_cpm
         FROM campaigns
         WHERE status = 'active'
           AND metrics IS NOT NULL`,
      );
      return parseFloat(result.rows[0]?.avg_cpm || '0');
    } catch {
      this.log.warn('Could not compute average CPM');
      return 0;
    }
  }

  /**
   * Resolves a list of competitor IDs to their names.
   * Returns the ID itself if the name cannot be resolved.
   */
  private async resolveCompetitorNames(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];

    try {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM competitors WHERE id IN (${placeholders})`,
        ids,
      );

      const nameMap = new Map(result.rows.map((r) => [r.id, r.name]));
      return ids.map((id) => nameMap.get(id) || id);
    } catch {
      return ids;
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - Analysis logic
  // ------------------------------------------------------------------

  /**
   * Rule-based fallback for competitor assessment when AI is unavailable.
   */
  private ruleBasedCompetitorAssessment(competitor: Competitor): {
    strengths: string[];
    weaknesses: string[];
    topChannels: string[];
    recentChanges: string[];
    threatLevel: 'low' | 'medium' | 'high';
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const topChannels: string[] = [];
    const metrics = competitor.metrics;

    if (metrics.market_share !== undefined && metrics.market_share > 10) {
      strengths.push(`Significant market share: ${metrics.market_share}%`);
    }
    if (metrics.estimated_spend !== undefined && metrics.estimated_spend > 50000) {
      strengths.push(`Substantial advertising budget: $${metrics.estimated_spend.toLocaleString()}`);
    }
    if (metrics.creative_count !== undefined && metrics.creative_count > 50) {
      strengths.push(`Large creative portfolio: ${metrics.creative_count} assets`);
    }

    if (metrics.creative_count !== undefined && metrics.creative_count < 5) {
      weaknesses.push('Limited creative variety');
    }
    if (!metrics.estimated_spend || metrics.estimated_spend === 0) {
      weaknesses.push('No detectable advertising spend');
    }

    // Extract top channels from platforms data
    if (competitor.platforms && typeof competitor.platforms === 'object') {
      topChannels.push(
        ...Object.keys(competitor.platforms).slice(0, 5),
      );
    }

    return {
      strengths,
      weaknesses,
      topChannels,
      recentChanges: [],
      threatLevel: this.assessThreatLevel(metrics),
    };
  }

  /**
   * Determines threat level based on competitor metrics.
   */
  private assessThreatLevel(
    metrics: CompetitorMetric,
  ): 'low' | 'medium' | 'high' {
    let score = 0;

    if (metrics.market_share !== undefined) {
      if (metrics.market_share > 20) score += 3;
      else if (metrics.market_share > 10) score += 2;
      else if (metrics.market_share > 5) score += 1;
    }

    if (metrics.estimated_spend !== undefined) {
      if (metrics.estimated_spend > 100000) score += 3;
      else if (metrics.estimated_spend > 50000) score += 2;
      else if (metrics.estimated_spend > 10000) score += 1;
    }

    if (metrics.ad_frequency !== undefined && metrics.ad_frequency > 5) {
      score += 1;
    }

    if (metrics.creative_count !== undefined && metrics.creative_count > 30) {
      score += 1;
    }

    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  /**
   * Detects significant changes in competitor metrics compared to previous state.
   */
  private async detectSignificantChanges(
    competitors: Competitor[],
    previousState: Record<string, unknown> | null,
  ): Promise<string[]> {
    const changes: string[] = [];

    if (!previousState || !previousState.competitorMetrics) {
      return changes;
    }

    const prevMetrics = previousState.competitorMetrics as Record<
      string,
      CompetitorMetric
    >;

    for (const competitor of competitors) {
      const prev = prevMetrics[competitor.id];
      if (!prev) continue;

      const current = competitor.metrics;

      // Detect significant spend changes (> 20%)
      if (
        current.estimated_spend !== undefined &&
        prev.estimated_spend !== undefined &&
        prev.estimated_spend > 0
      ) {
        const changePercent =
          ((current.estimated_spend - prev.estimated_spend) /
            prev.estimated_spend) *
          100;
        if (Math.abs(changePercent) >= 20) {
          changes.push(
            `${competitor.name}: Estimated spend ${changePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(changePercent))}%`,
          );
        }
      }

      // Detect market share changes (> 2pp)
      if (
        current.market_share !== undefined &&
        prev.market_share !== undefined
      ) {
        const shareChange = current.market_share - prev.market_share;
        if (Math.abs(shareChange) >= 2) {
          changes.push(
            `${competitor.name}: Market share ${shareChange > 0 ? 'gained' : 'lost'} ${Math.abs(Math.round(shareChange * 10) / 10)}pp`,
          );
        }
      }

      // Detect creative volume changes (> 50%)
      if (
        current.creative_count !== undefined &&
        prev.creative_count !== undefined &&
        prev.creative_count > 0
      ) {
        const creativeChange =
          ((current.creative_count - prev.creative_count) /
            prev.creative_count) *
          100;
        if (Math.abs(creativeChange) >= 50) {
          changes.push(
            `${competitor.name}: Creative volume ${creativeChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(creativeChange))}%`,
          );
        }
      }
    }

    return changes;
  }

  /**
   * Normalises a metric value relative to a reference value on a 0-100 scale.
   */
  private normalizeMetric(value: number, reference: number): number {
    if (reference === 0 && value === 0) return 50;
    if (reference === 0) return 100;
    const ratio = value / reference;
    return Math.min(100, Math.round(ratio * 50));
  }

  /**
   * Estimates implementation effort based on gap area and magnitude.
   */
  private estimateEffort(
    area: string,
    magnitude: number,
  ): 'low' | 'medium' | 'high' {
    const highEffortAreas = ['market_share', 'brand_awareness', 'product_feature'];
    const lowEffortAreas = ['ad_frequency', 'creative_volume', 'messaging'];

    if (highEffortAreas.includes(area) || magnitude > 50) return 'high';
    if (lowEffortAreas.includes(area) && magnitude < 30) return 'low';
    return 'medium';
  }

  /**
   * Parses a time window string (e.g. '30d', '2w', '6m') into days.
   */
  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)([dwm])$/);
    if (!match) return 30; // default to 30 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value;
      case 'w':
        return value * 7;
      case 'm':
        return value * 30;
      default:
        return 30;
    }
  }

  /**
   * Extracts a specific metric value from all competitors for benchmarking.
   */
  private extractCompetitorMetricValues(
    competitors: Competitor[],
    metricName: string,
  ): number[] {
    const values: number[] = [];

    // Map common metric names to CompetitorMetric fields
    const metricFieldMap: Record<string, keyof CompetitorMetric> = {
      spend: 'estimated_spend',
      estimated_spend: 'estimated_spend',
      market_share: 'market_share',
      ad_frequency: 'ad_frequency',
      creative_count: 'creative_count',
    };

    const field = metricFieldMap[metricName];

    for (const competitor of competitors) {
      let value: number | undefined;

      if (field) {
        value = competitor.metrics[field] as number | undefined;
      } else {
        // Try to find the metric in the platforms data
        if (competitor.platforms && typeof competitor.platforms === 'object') {
          for (const platformData of Object.values(competitor.platforms)) {
            if (platformData && typeof platformData === 'object') {
              const data = platformData as Record<string, unknown>;
              if (typeof data[metricName] === 'number') {
                value = data[metricName] as number;
                break;
              }
            }
          }
        }
      }

      if (value !== undefined && value !== null) {
        values.push(value);
      }
    }

    return values;
  }

  /**
   * Removes duplicate opportunities, keeping the highest-priority version.
   */
  private deduplicateOpportunities(opportunities: Opportunity[]): Opportunity[] {
    const bestByArea = new Map<string, Opportunity>();

    for (const opp of opportunities) {
      const existing = bestByArea.get(opp.area);
      if (!existing || opp.priority > existing.priority) {
        bestByArea.set(opp.area, opp);
      }
    }

    return Array.from(bestByArea.values()).sort(
      (a, b) => b.priority - a.priority,
    );
  }
}

// ============================================================
// AI International Growth Engine - Organic Social Agent (Agent 4)
// Handles post scheduling, engagement optimization, hashtag
// strategy, and tone adaptation per country.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import type { AgentType, DateRange, Country } from '../../types';
import type {
  AgentInput,
  AgentOutput,
  AgentConfig,
} from '../base/types';

// ---- Domain Types ----

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'twitter' | 'youtube';
export type MediaType = 'image' | 'video' | 'carousel' | 'story' | 'reel' | 'text';
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  content: string;
  platform: SocialPlatform;
  countryId: string;
  scheduledAt: string;
  hashtags: string[];
  mediaType: MediaType;
  status: PostStatus;
  engagement?: {
    likes: number;
    comments: number;
    shares: number;
    reach: number;
  };
}

export interface ScheduledPost {
  content: string;
  scheduledAt: string;
  platform: SocialPlatform;
  hashtags: string[];
  mediaType: MediaType;
  targetAudience: string;
}

export interface PostSchedule {
  posts: ScheduledPost[];
  countryId: string;
  platform: SocialPlatform;
  period: DateRange;
}

export interface EngagementRecommendation {
  postId: string;
  suggestion: string;
  expectedLift: number;
  confidence: number;
}

export interface HashtagStrategy {
  primary: string[];
  secondary: string[];
  trending: string[];
  countrySpecific: string[];
}

export interface EngagementPattern {
  bestDays: string[];
  bestHours: number[];
  topContentTypes: string[];
  averageEngagementRate: number;
}

export interface ContentCalendar {
  month: string;
  entries: CalendarEntry[];
}

export interface CalendarEntry {
  date: string;
  posts: ScheduledPost[];
  theme?: string;
}

export interface PostPerformance {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  engagementRate: number;
  sentiment: number;
}

// ---- Cache TTLs (seconds) ----

const CACHE_TTL_ENGAGEMENT_PATTERNS = 1800; // 30 minutes
const CACHE_TTL_POSTING_TIMES = 3600;       // 1 hour
const CACHE_TTL_HASHTAG_STRATEGY = 900;     // 15 minutes

// ---- Default Agent Configuration ----

const DEFAULT_CONFIG: AgentConfig = {
  agentType: 'organic_social',
  model: 'sonnet',
  maxRetries: 3,
  timeoutMs: 60_000,
  confidenceThreshold: 65,
};

// ============================================================
// OrganicSocialAgent
// ============================================================

export class OrganicSocialAgent extends BaseAgent {
  constructor(config: Partial<AgentConfig> = {}) {
    super({
      ...DEFAULT_CONFIG,
      ...config,
      agentType: 'organic_social',
      model: config.model ?? 'sonnet',
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the list of peer agent types that this agent is qualified
   * to challenge via the cross-challenge protocol.
   */
  getChallengeTargets(): AgentType[] {
    return ['content_blog', 'creative_generation', 'brand_consistency'];
  }

  /**
   * Returns the Claude system prompt that shapes the agent's AI persona
   * for organic social media strategy and optimisation.
   */
  getSystemPrompt(): string {
    return [
      'You are an expert organic social media strategist for international markets.',
      'You specialise in post scheduling, engagement optimisation, hashtag strategy, and cultural tone adaptation.',
      'Your recommendations must be data-driven and country-specific.',
      'Always consider local cultural norms, platform-specific best practices, and audience demographics.',
      'Provide structured JSON responses when asked for scheduling, engagement, or hashtag data.',
      'Flag any uncertainties about cultural appropriateness or data freshness explicitly.',
      'Never fabricate engagement metrics or trending data.',
    ].join(' ');
  }

  /**
   * Core processing pipeline for the Organic Social Agent.
   *
   * 1. Loads scheduled posts and engagement data from DB
   * 2. Analyses engagement patterns per country/platform
   * 3. Generates a post schedule with optimal timing
   * 4. Adapts tone per country cultural profile
   * 5. Generates hashtag strategies
   * 6. Returns AgentOutput with social media plan
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing organic social request', {
      requestId: input.requestId,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];
    const recommendations: string[] = [];

    // Extract parameters
    const countryId = input.parameters.countryId as string | undefined;
    const platform = input.parameters.platform as SocialPlatform | undefined;
    const period = input.context.period as DateRange | undefined;

    if (!countryId) {
      return this.buildOutput(
        'organic_social_plan_failed',
        {},
        this.calculateConfidence({ dataAvailability: 0 }),
        'No countryId provided in input parameters.',
        [],
        ['Missing required parameter: countryId'],
        [],
      );
    }

    // Step 1: Load scheduled posts and engagement data
    const existingPosts = await this.loadScheduledPosts(countryId, platform);
    if (existingPosts.length === 0) {
      uncertainties.push(
        this.flagUncertainty(
          'historical_data',
          `No historical posts found for country ${countryId}. Recommendations will be based on platform defaults and AI analysis.`,
        ),
      );
    }

    // Step 2: Analyse engagement patterns
    const engagementPattern = await this.analyzeEngagementPatterns(countryId);

    if (engagementPattern.averageEngagementRate === 0) {
      uncertainties.push(
        this.flagUncertainty(
          'engagement_data',
          `No engagement data available for country ${countryId}. Pattern analysis is based on AI inference.`,
        ),
      );
    }

    // Step 3: Generate post schedule with optimal timing
    let postSchedule: PostSchedule | null = null;
    if (platform && period) {
      postSchedule = await this.generatePostSchedule(countryId, platform, period);
      if (postSchedule.posts.length === 0) {
        warnings.push('Generated schedule contains no posts. Review period and platform constraints.');
      }
    } else {
      warnings.push(
        'Post schedule not generated: platform and/or period not specified in input.',
      );
    }

    // Step 4: Adapt tone per country cultural profile
    const countryProfile = await this.loadCountryProfile(countryId);
    let toneGuidance = '';
    if (countryProfile) {
      toneGuidance = await this.generateToneGuidance(countryProfile);
    } else {
      uncertainties.push(
        this.flagUncertainty(
          'country_profile',
          `Country profile not found for ${countryId}. Tone adaptation skipped.`,
        ),
      );
    }

    // Step 5: Generate hashtag strategies
    const topic = input.parameters.topic as string | undefined;
    let hashtagStrategy: HashtagStrategy | null = null;
    if (platform) {
      hashtagStrategy = await this.generateHashtagStrategy(
        countryId,
        platform,
        topic ?? 'general',
      );
    }

    // Step 6: Optimise existing posts
    let engagementRecs: EngagementRecommendation[] = [];
    if (existingPosts.length > 0) {
      engagementRecs = await this.optimizeEngagement(existingPosts);
      for (const rec of engagementRecs) {
        recommendations.push(`Post ${rec.postId}: ${rec.suggestion} (expected +${rec.expectedLift}% engagement)`);
      }
    }

    // Build recommendation summaries
    if (engagementPattern.bestDays.length > 0) {
      recommendations.push(
        `Prioritise posting on ${engagementPattern.bestDays.join(', ')} for highest engagement.`,
      );
    }
    if (engagementPattern.bestHours.length > 0) {
      recommendations.push(
        `Optimal posting hours: ${engagementPattern.bestHours.map(h => `${h}:00`).join(', ')} (local time).`,
      );
    }
    if (engagementPattern.topContentTypes.length > 0) {
      recommendations.push(
        `Top performing content types: ${engagementPattern.topContentTypes.join(', ')}.`,
      );
    }
    if (toneGuidance) {
      recommendations.push(`Tone guidance: ${toneGuidance}`);
    }

    // Calculate confidence
    const confidence = this.calculateConfidence({
      dataAvailability: existingPosts.length > 0 ? 75 : 30,
      engagementDataQuality: engagementPattern.averageEngagementRate > 0 ? 80 : 25,
      countryProfileAvailable: countryProfile ? 85 : 20,
      hashtagDataQuality: hashtagStrategy ? 70 : 30,
      scheduleGenerated: postSchedule && postSchedule.posts.length > 0 ? 80 : 35,
    });

    // Build output data
    const data: Record<string, unknown> = {
      countryId,
      platform: platform ?? null,
      engagementPattern,
      postSchedule,
      hashtagStrategy,
      toneGuidance: toneGuidance || null,
      engagementRecommendations: engagementRecs,
      existingPostCount: existingPosts.length,
    };

    const reasoning = this.buildReasoning(
      existingPosts.length,
      engagementPattern,
      postSchedule,
      countryProfile,
    );

    const output = this.buildOutput(
      'organic_social_plan',
      data,
      confidence,
      reasoning,
      recommendations,
      warnings,
      uncertainties,
    );

    // Persist state and log decision
    await this.persistState({
      lastProcessedCountry: countryId,
      lastProcessedPlatform: platform ?? null,
      postsAnalysed: existingPosts.length,
      confidenceScore: confidence.score,
    });

    await this.logDecision(input, output);

    return output;
  }

  // ------------------------------------------------------------------
  // Public domain methods
  // ------------------------------------------------------------------

  /**
   * Generates a post schedule with optimal timing for a given country,
   * platform, and date range based on engagement patterns and AI analysis.
   */
  async generatePostSchedule(
    countryId: string,
    platform: SocialPlatform | string,
    period: DateRange,
  ): Promise<PostSchedule> {
    this.log.info('Generating post schedule', { countryId, platform, period });

    const optimalTimes = await this.getOptimalPostingTimes(countryId, platform);
    const engagementPattern = await this.analyzeEngagementPatterns(countryId);

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `Generate a social media post schedule for country ${countryId} on ${platform}.`,
      `Period: ${period.startDate} to ${period.endDate}.`,
      `Optimal posting times: ${optimalTimes.join(', ')}.`,
      `Best performing days: ${engagementPattern.bestDays.join(', ')}.`,
      `Top content types: ${engagementPattern.topContentTypes.join(', ')}.`,
      'Return a JSON array of scheduled posts with: content, scheduledAt (ISO 8601), platform, hashtags, mediaType, targetAudience.',
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    const posts = this.parseScheduledPosts(aiResponse, platform as SocialPlatform);

    return {
      posts,
      countryId,
      platform: platform as SocialPlatform,
      period,
    };
  }

  /**
   * Analyses existing posts and returns engagement optimisation
   * recommendations for each post.
   */
  async optimizeEngagement(
    posts: SocialPost[],
  ): Promise<EngagementRecommendation[]> {
    this.log.info('Optimising engagement', { postCount: posts.length });

    if (posts.length === 0) {
      return [];
    }

    const systemPrompt = this.getSystemPrompt();
    const postSummaries = posts.map((p) => ({
      id: p.id,
      content: p.content.substring(0, 200),
      platform: p.platform,
      hashtags: p.hashtags,
      mediaType: p.mediaType,
      engagement: p.engagement ?? null,
    }));

    const userPrompt = [
      'Analyse the following social media posts and provide engagement optimisation recommendations.',
      'For each post, suggest one specific improvement and estimate the expected engagement lift percentage.',
      `Posts:\n${JSON.stringify(postSummaries, null, 2)}`,
      'Return a JSON array with: postId, suggestion, expectedLift (number), confidence (0-100).',
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    return this.parseEngagementRecommendations(aiResponse, posts);
  }

  /**
   * Generates a hashtag strategy for a given country, platform, and topic.
   * Returns primary, secondary, trending, and country-specific hashtags.
   */
  async generateHashtagStrategy(
    countryId: string,
    platform: SocialPlatform | string,
    topic: string,
  ): Promise<HashtagStrategy> {
    this.log.info('Generating hashtag strategy', { countryId, platform, topic });

    const cacheKey = `organic_social:hashtags:${countryId}:${platform}:${topic}`;
    const cached = await cacheGet<HashtagStrategy>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached hashtag strategy');
      return cached;
    }

    const countryProfile = await this.loadCountryProfile(countryId);
    const language = countryProfile?.language ?? 'en';

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `Generate a hashtag strategy for ${platform} targeting country ${countryId} (language: ${language}).`,
      `Topic: ${topic}.`,
      'Return a JSON object with:',
      '  primary: array of 3-5 core brand/topic hashtags,',
      '  secondary: array of 5-8 broader reach hashtags,',
      '  trending: array of 2-4 currently relevant hashtags (if any),',
      '  countrySpecific: array of 3-5 hashtags localised for the target country and language.',
      'Do not invent trending hashtags if you are unsure. Use an empty array instead.',
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    const strategy = this.parseHashtagStrategy(aiResponse);

    await cacheSet(cacheKey, strategy, CACHE_TTL_HASHTAG_STRATEGY);
    return strategy;
  }

  /**
   * Adapts content tone for a specific country's cultural profile.
   * Returns the culturally adapted version of the content.
   */
  async adaptTone(content: string, countryId: string): Promise<string> {
    this.log.info('Adapting tone', { countryId, contentLength: content.length });

    const countryProfile = await this.loadCountryProfile(countryId);
    if (!countryProfile) {
      this.log.warn('Country profile not found for tone adaptation', { countryId });
      return content;
    }

    const culturalBehavior = countryProfile.cultural_behavior ?? {};
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `Adapt the following social media content for ${countryProfile.name} (${countryProfile.language}).`,
      `cultural_behavior: ${JSON.stringify(culturalBehavior)}.`,
      'Preserve the core message but adjust tone, idioms, and cultural references.',
      `Original content:\n${content}`,
      'Return only the adapted content text, no additional commentary.',
    ].join('\n');

    const adaptedContent = await this.callAI(systemPrompt, userPrompt);
    return adaptedContent.trim();
  }

  /**
   * Analyses engagement patterns for a country based on historical
   * post performance data stored in the database.
   */
  async analyzeEngagementPatterns(countryId: string): Promise<EngagementPattern> {
    this.log.info('Analysing engagement patterns', { countryId });

    const cacheKey = `organic_social:engagement_patterns:${countryId}`;
    const cached = await cacheGet<EngagementPattern>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached engagement patterns');
      return cached;
    }

    // Query aggregated engagement data from DB
    const engagementData = await this.queryEngagementData(countryId);

    if (!engagementData || engagementData.totalPosts === 0) {
      // No historical data; use AI to infer reasonable defaults
      const pattern = await this.inferEngagementPatterns(countryId);
      await cacheSet(cacheKey, pattern, CACHE_TTL_ENGAGEMENT_PATTERNS);
      return pattern;
    }

    const pattern: EngagementPattern = {
      bestDays: engagementData.bestDays,
      bestHours: engagementData.bestHours,
      topContentTypes: engagementData.topContentTypes,
      averageEngagementRate: engagementData.averageEngagementRate,
    };

    await cacheSet(cacheKey, pattern, CACHE_TTL_ENGAGEMENT_PATTERNS);
    return pattern;
  }

  /**
   * Returns the optimal posting times for a given country and platform,
   * derived from historical engagement data and timezone information.
   */
  async getOptimalPostingTimes(
    countryId: string,
    platform: SocialPlatform | string,
  ): Promise<string[]> {
    this.log.info('Getting optimal posting times', { countryId, platform });

    const cacheKey = `organic_social:posting_times:${countryId}:${platform}`;
    const cached = await cacheGet<string[]>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached posting times');
      return cached;
    }

    const engagementPattern = await this.analyzeEngagementPatterns(countryId);
    const countryProfile = await this.loadCountryProfile(countryId);
    const timezone = countryProfile?.timezone ?? 'UTC';

    // Build time slots from best hours
    const times: string[] = engagementPattern.bestHours.map((hour) => {
      const paddedHour = hour.toString().padStart(2, '0');
      return `${paddedHour}:00 ${timezone}`;
    });

    // If no historical data, use AI to suggest times
    if (times.length === 0) {
      const aiTimes = await this.inferPostingTimes(countryId, platform, timezone);
      await cacheSet(cacheKey, aiTimes, CACHE_TTL_POSTING_TIMES);
      return aiTimes;
    }

    await cacheSet(cacheKey, times, CACHE_TTL_POSTING_TIMES);
    return times;
  }

  /**
   * Generates a full content calendar for a given country, platform,
   * and month with themed entries and scheduled posts.
   */
  async generateContentCalendar(
    countryId: string,
    platform: SocialPlatform | string,
    month: string,
  ): Promise<ContentCalendar> {
    this.log.info('Generating content calendar', { countryId, platform, month });

    const engagementPattern = await this.analyzeEngagementPatterns(countryId);
    const hashtagStrategy = await this.generateHashtagStrategy(
      countryId,
      platform,
      'monthly_planning',
    );

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `Generate a content calendar for ${platform} targeting country ${countryId} for month ${month}.`,
      `Best performing days: ${engagementPattern.bestDays.join(', ')}.`,
      `Top content types: ${engagementPattern.topContentTypes.join(', ')}.`,
      `Available hashtags: ${JSON.stringify(hashtagStrategy)}.`,
      'Return a JSON object with:',
      '  month: the month string,',
      '  entries: array of { date (YYYY-MM-DD), posts: array of ScheduledPost, theme?: string }.',
      'Each ScheduledPost has: content, scheduledAt, platform, hashtags, mediaType, targetAudience.',
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    return this.parseContentCalendar(aiResponse, month);
  }

  /**
   * Assesses the performance of a specific published post by loading
   * its engagement metrics and computing sentiment.
   */
  async assessPostPerformance(postId: string): Promise<PostPerformance> {
    this.log.info('Assessing post performance', { postId });

    const result = await pool.query(
      `SELECT sp.id, sp.content, sp.platform, sp.country_id,
              sp.scheduled_at, sp.hashtags, sp.media_type, sp.status,
              COALESCE(spe.likes, 0) AS likes,
              COALESCE(spe.comments, 0) AS comments,
              COALESCE(spe.shares, 0) AS shares,
              COALESCE(spe.reach, 0) AS reach,
              COALESCE(spe.sentiment, 0) AS sentiment
       FROM social_posts sp
       LEFT JOIN social_post_engagement spe ON spe.post_id = sp.id
       WHERE sp.id = $1`,
      [postId],
    );

    if (result.rows.length === 0) {
      this.log.warn('Post not found for performance assessment', { postId });
      return {
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        engagementRate: 0,
        sentiment: 0,
      };
    }

    const row = result.rows[0];
    const likes = Number(row.likes);
    const comments = Number(row.comments);
    const shares = Number(row.shares);
    const reach = Number(row.reach);
    const sentiment = Number(row.sentiment);

    const totalInteractions = likes + comments + shares;
    const engagementRate = reach > 0 ? (totalInteractions / reach) * 100 : 0;

    return {
      likes,
      comments,
      shares,
      reach,
      engagementRate: Math.round(engagementRate * 100) / 100,
      sentiment,
    };
  }

  // ------------------------------------------------------------------
  // Private helpers — data loading
  // ------------------------------------------------------------------

  /**
   * Loads scheduled or published posts for a country (and optionally platform)
   * from the social_posts table.
   */
  private async loadScheduledPosts(
    countryId: string,
    platform?: SocialPlatform | string,
  ): Promise<SocialPost[]> {
    let sql = `
      SELECT sp.id, sp.content, sp.platform, sp.country_id,
             sp.scheduled_at, sp.hashtags, sp.media_type, sp.status,
             spe.likes, spe.comments, spe.shares, spe.reach
      FROM social_posts sp
      LEFT JOIN social_post_engagement spe ON spe.post_id = sp.id
      WHERE sp.country_id = $1
    `;
    const params: unknown[] = [countryId];

    if (platform) {
      sql += ' AND sp.platform = $2';
      params.push(platform);
    }

    sql += ' ORDER BY sp.scheduled_at DESC LIMIT 200';

    const result = await pool.query(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      platform: row.platform as SocialPlatform,
      countryId: row.country_id,
      scheduledAt: row.scheduled_at,
      hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
      mediaType: row.media_type as MediaType,
      status: row.status as PostStatus,
      engagement:
        row.likes != null
          ? {
              likes: Number(row.likes),
              comments: Number(row.comments),
              shares: Number(row.shares),
              reach: Number(row.reach),
            }
          : undefined,
    }));
  }

  /**
   * Loads a country profile from the countries table.
   */
  private async loadCountryProfile(countryId: string): Promise<Country | null> {
    const cacheKey = `organic_social:country:${countryId}`;
    const cached = await cacheGet<Country>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      'SELECT * FROM countries WHERE id = $1 AND is_active = true LIMIT 1',
      [countryId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const country = result.rows[0] as Country;
    await cacheSet(cacheKey, country, 3600);
    return country;
  }

  /**
   * Queries aggregated engagement data from the database for a country.
   * Returns null if no data is available.
   */
  private async queryEngagementData(
    countryId: string,
  ): Promise<{
    totalPosts: number;
    bestDays: string[];
    bestHours: number[];
    topContentTypes: string[];
    averageEngagementRate: number;
  } | null> {
    // Total post count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM social_posts
       WHERE country_id = $1 AND status = 'published'`,
      [countryId],
    );
    const totalPosts = Number(countResult.rows[0]?.count ?? 0);
    if (totalPosts === 0) {
      return null;
    }

    // Best days of week by average engagement
    const daysResult = await pool.query(
      `SELECT TO_CHAR(sp.scheduled_at, 'Day') AS day_name,
              AVG(COALESCE(spe.likes, 0) + COALESCE(spe.comments, 0) + COALESCE(spe.shares, 0)) AS avg_engagement
       FROM social_posts sp
       LEFT JOIN social_post_engagement spe ON spe.post_id = sp.id
       WHERE sp.country_id = $1 AND sp.status = 'published'
       GROUP BY TO_CHAR(sp.scheduled_at, 'Day')
       ORDER BY avg_engagement DESC
       LIMIT 3`,
      [countryId],
    );
    const bestDays = daysResult.rows.map((r) => (r.day_name as string).trim());

    // Best hours by average engagement
    const hoursResult = await pool.query(
      `SELECT EXTRACT(HOUR FROM sp.scheduled_at) AS hour,
              AVG(COALESCE(spe.likes, 0) + COALESCE(spe.comments, 0) + COALESCE(spe.shares, 0)) AS avg_engagement
       FROM social_posts sp
       LEFT JOIN social_post_engagement spe ON spe.post_id = sp.id
       WHERE sp.country_id = $1 AND sp.status = 'published'
       GROUP BY EXTRACT(HOUR FROM sp.scheduled_at)
       ORDER BY avg_engagement DESC
       LIMIT 4`,
      [countryId],
    );
    const bestHours = hoursResult.rows.map((r) => Number(r.hour));

    // Top content types
    const typesResult = await pool.query(
      `SELECT sp.media_type,
              AVG(COALESCE(spe.likes, 0) + COALESCE(spe.comments, 0) + COALESCE(spe.shares, 0)) AS avg_engagement
       FROM social_posts sp
       LEFT JOIN social_post_engagement spe ON spe.post_id = sp.id
       WHERE sp.country_id = $1 AND sp.status = 'published'
       GROUP BY sp.media_type
       ORDER BY avg_engagement DESC
       LIMIT 3`,
      [countryId],
    );
    const topContentTypes = typesResult.rows.map((r) => r.media_type as string);

    // Average engagement rate
    const rateResult = await pool.query(
      `SELECT AVG(
         CASE WHEN COALESCE(spe.reach, 0) > 0
              THEN (COALESCE(spe.likes, 0) + COALESCE(spe.comments, 0) + COALESCE(spe.shares, 0))::FLOAT / spe.reach * 100
              ELSE 0
         END
       ) AS avg_rate
       FROM social_posts sp
       LEFT JOIN social_post_engagement spe ON spe.post_id = sp.id
       WHERE sp.country_id = $1 AND sp.status = 'published'`,
      [countryId],
    );
    const averageEngagementRate = Math.round((Number(rateResult.rows[0]?.avg_rate ?? 0)) * 100) / 100;

    return {
      totalPosts,
      bestDays,
      bestHours,
      topContentTypes,
      averageEngagementRate,
    };
  }

  /**
   * Uses AI to infer engagement patterns when no historical data exists.
   */
  private async inferEngagementPatterns(
    countryId: string,
  ): Promise<EngagementPattern> {
    const countryProfile = await this.loadCountryProfile(countryId);
    const countryName = countryProfile?.name ?? countryId;
    const timezone = countryProfile?.timezone ?? 'UTC';

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `No historical engagement data exists for ${countryName} (timezone: ${timezone}).`,
      'Based on general social media research for this market, infer likely engagement patterns.',
      'Return a JSON object with:',
      '  bestDays: array of day names (e.g. ["Monday", "Wednesday", "Friday"]),',
      '  bestHours: array of hours as integers 0-23 (e.g. [9, 12, 18]),',
      '  topContentTypes: array of media types (e.g. ["reel", "carousel", "image"]),',
      '  averageEngagementRate: estimated average rate as a number (e.g. 2.5).',
      'Be conservative with estimates and note this is inferred, not measured.',
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    return this.parseEngagementPattern(aiResponse);
  }

  /**
   * Uses AI to infer optimal posting times when no historical data exists.
   */
  private async inferPostingTimes(
    countryId: string,
    platform: SocialPlatform | string,
    timezone: string,
  ): Promise<string[]> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `Suggest optimal posting times for ${platform} in country ${countryId} (timezone: ${timezone}).`,
      'Return a JSON array of time strings in format "HH:00 TIMEZONE" (e.g. ["09:00 Europe/Berlin", "18:00 Europe/Berlin"]).',
      'Provide 3-5 time slots based on general platform research.',
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    return this.parseTimesArray(aiResponse, timezone);
  }

  /**
   * Generates tone guidance text for a given country profile using AI.
   */
  private async generateToneGuidance(country: Country): Promise<string> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = [
      `Provide concise tone guidance for social media content targeting ${country.name} (${country.language}).`,
      `Cultural behaviour context: ${JSON.stringify(country.cultural_behavior ?? {})}.`,
      'Return a short paragraph (2-3 sentences) describing the recommended tone, formality level, and cultural considerations.',
    ].join('\n');

    const guidance = await this.callAI(systemPrompt, userPrompt);
    return guidance.trim();
  }

  // ------------------------------------------------------------------
  // Private helpers — AI response parsing
  // ------------------------------------------------------------------

  /**
   * Attempts to extract a JSON value from an AI response string.
   * Handles cases where the AI wraps JSON in markdown code blocks.
   */
  private extractJSON(response: string): unknown {
    let cleaned = response.trim();

    // Strip markdown code fences
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    return JSON.parse(cleaned);
  }

  /**
   * Parses AI response into an array of ScheduledPost objects.
   */
  private parseScheduledPosts(
    response: string,
    fallbackPlatform: SocialPlatform,
  ): ScheduledPost[] {
    try {
      const parsed = this.extractJSON(response);
      const items = Array.isArray(parsed) ? parsed : [];
      return items.map((item: Record<string, unknown>) => ({
        content: String(item.content ?? ''),
        scheduledAt: String(item.scheduledAt ?? item.scheduled_at ?? new Date().toISOString()),
        platform: (item.platform as SocialPlatform) ?? fallbackPlatform,
        hashtags: Array.isArray(item.hashtags) ? item.hashtags.map(String) : [],
        mediaType: (item.mediaType as MediaType) ?? (item.media_type as MediaType) ?? 'image',
        targetAudience: String(item.targetAudience ?? item.target_audience ?? 'general'),
      }));
    } catch (error) {
      this.log.warn('Failed to parse scheduled posts from AI response', { error });
      return [];
    }
  }

  /**
   * Parses AI response into engagement recommendations.
   */
  private parseEngagementRecommendations(
    response: string,
    sourcePosts: SocialPost[],
  ): EngagementRecommendation[] {
    try {
      const parsed = this.extractJSON(response);
      const items = Array.isArray(parsed) ? parsed : [];
      const validPostIds = new Set(sourcePosts.map((p) => p.id));

      return items
        .filter((item: Record<string, unknown>) => {
          const postId = String(item.postId ?? item.post_id ?? '');
          return validPostIds.has(postId);
        })
        .map((item: Record<string, unknown>) => ({
          postId: String(item.postId ?? item.post_id),
          suggestion: String(item.suggestion ?? ''),
          expectedLift: Number(item.expectedLift ?? item.expected_lift ?? 0),
          confidence: Math.min(100, Math.max(0, Number(item.confidence ?? 50))),
        }));
    } catch (error) {
      this.log.warn('Failed to parse engagement recommendations from AI response', { error });
      return [];
    }
  }

  /**
   * Parses AI response into a HashtagStrategy.
   */
  private parseHashtagStrategy(response: string): HashtagStrategy {
    const defaultStrategy: HashtagStrategy = {
      primary: [],
      secondary: [],
      trending: [],
      countrySpecific: [],
    };

    try {
      const parsed = this.extractJSON(response) as Record<string, unknown>;
      return {
        primary: Array.isArray(parsed.primary) ? parsed.primary.map(String) : [],
        secondary: Array.isArray(parsed.secondary) ? parsed.secondary.map(String) : [],
        trending: Array.isArray(parsed.trending) ? parsed.trending.map(String) : [],
        countrySpecific: Array.isArray(parsed.countrySpecific ?? parsed.country_specific)
          ? (parsed.countrySpecific as string[] ?? parsed.country_specific as string[]).map(String)
          : [],
      };
    } catch (error) {
      this.log.warn('Failed to parse hashtag strategy from AI response', { error });
      return defaultStrategy;
    }
  }

  /**
   * Parses AI response into an EngagementPattern.
   */
  private parseEngagementPattern(response: string): EngagementPattern {
    try {
      const parsed = this.extractJSON(response) as Record<string, unknown>;
      return {
        bestDays: Array.isArray(parsed.bestDays ?? parsed.best_days)
          ? ((parsed.bestDays ?? parsed.best_days) as string[]).map(String)
          : [],
        bestHours: Array.isArray(parsed.bestHours ?? parsed.best_hours)
          ? ((parsed.bestHours ?? parsed.best_hours) as number[]).map(Number)
          : [],
        topContentTypes: Array.isArray(parsed.topContentTypes ?? parsed.top_content_types)
          ? ((parsed.topContentTypes ?? parsed.top_content_types) as string[]).map(String)
          : [],
        averageEngagementRate: Number(parsed.averageEngagementRate ?? parsed.average_engagement_rate ?? 0),
      };
    } catch (error) {
      this.log.warn('Failed to parse engagement pattern from AI response', { error });
      return {
        bestDays: [],
        bestHours: [],
        topContentTypes: [],
        averageEngagementRate: 0,
      };
    }
  }

  /**
   * Parses AI response into a ContentCalendar.
   */
  private parseContentCalendar(response: string, fallbackMonth: string): ContentCalendar {
    try {
      const parsed = this.extractJSON(response) as Record<string, unknown>;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

      return {
        month: String(parsed.month ?? fallbackMonth),
        entries: entries.map((entry: Record<string, unknown>) => ({
          date: String(entry.date ?? ''),
          posts: Array.isArray(entry.posts)
            ? entry.posts.map((p: Record<string, unknown>) => ({
                content: String(p.content ?? ''),
                scheduledAt: String(p.scheduledAt ?? p.scheduled_at ?? ''),
                platform: (p.platform as SocialPlatform) ?? 'instagram',
                hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
                mediaType: (p.mediaType as MediaType) ?? (p.media_type as MediaType) ?? 'image',
                targetAudience: String(p.targetAudience ?? p.target_audience ?? 'general'),
              }))
            : [],
          theme: entry.theme ? String(entry.theme) : undefined,
        })),
      };
    } catch (error) {
      this.log.warn('Failed to parse content calendar from AI response', { error });
      return { month: fallbackMonth, entries: [] };
    }
  }

  /**
   * Parses AI response into an array of time strings.
   */
  private parseTimesArray(response: string, fallbackTimezone: string): string[] {
    try {
      const parsed = this.extractJSON(response);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
      return [];
    } catch (error) {
      this.log.warn('Failed to parse posting times from AI response', { error });
      return [`09:00 ${fallbackTimezone}`, `12:00 ${fallbackTimezone}`, `18:00 ${fallbackTimezone}`];
    }
  }

  // ------------------------------------------------------------------
  // Private helpers — reasoning
  // ------------------------------------------------------------------

  /**
   * Builds a human-readable reasoning string for the process output.
   */
  private buildReasoning(
    postCount: number,
    engagementPattern: EngagementPattern,
    postSchedule: PostSchedule | null,
    countryProfile: Country | null,
  ): string {
    const parts: string[] = [];

    parts.push(
      `Analysed ${postCount} existing post(s) for engagement patterns.`,
    );

    if (engagementPattern.averageEngagementRate > 0) {
      parts.push(
        `Average engagement rate is ${engagementPattern.averageEngagementRate}%.`,
      );
    } else {
      parts.push(
        'No measured engagement rate available; patterns were inferred via AI analysis.',
      );
    }

    if (postSchedule && postSchedule.posts.length > 0) {
      parts.push(
        `Generated a schedule of ${postSchedule.posts.length} post(s) for the requested period.`,
      );
    }

    if (countryProfile) {
      parts.push(
        `Tone adapted for ${countryProfile.name} (${countryProfile.language}).`,
      );
    }

    return parts.join(' ');
  }
}

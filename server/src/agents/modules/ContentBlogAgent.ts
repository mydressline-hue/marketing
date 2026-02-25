// ============================================================
// AI International Growth Engine - Content & Blog Agent (Agent 5)
// Handles SEO keyword research, long-form blog generation,
// internal linking, schema markup, Shopify publishing, and
// content localization for international markets.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { ValidationError, ExternalServiceError } from '../../utils/errors';
import type { AgentType, Content } from '../../types';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
} from '../base/types';

// ---- Agent-specific type definitions ----

export interface KeywordResearch {
  primaryKeyword: string;
  secondaryKeywords: string[];
  longTailKeywords: string[];
  searchVolume: Record<string, number>;
  difficulty: Record<string, number>;
  countryId: string;
}

export interface GeneratedBlogPost {
  title: string;
  slug: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  internalLinks: InternalLink[];
  schemaMarkup: SchemaMarkup;
  readabilityScore: number;
  wordCount: number;
  language: string;
  countryId: string;
}

export interface InternalLink {
  text: string;
  url: string;
  targetContentId: string;
}

export interface SchemaMarkup {
  type: string;
  data: Record<string, unknown>;
}

export interface ShopifyBlogPayload {
  title: string;
  body_html: string;
  tags: string;
  published: boolean;
  metafields?: Record<string, unknown>[];
}

export interface SEOScore {
  overall: number;
  titleOptimization: number;
  metaOptimization: number;
  keywordDensity: number;
  readability: number;
  internalLinks: number;
  issues: string[];
}

export interface ContentPerformance {
  views: number;
  avgTimeOnPage: number;
  bounceRate: number;
  conversions: number;
}

export interface TopicSuggestion {
  topic: string;
  relevanceScore: number;
  expectedTraffic: number;
  competition: string;
}

// ---- Constants ----

const CACHE_TTL_KEYWORDS = 3600; // 1 hour
const CACHE_TTL_TOPICS = 1800; // 30 minutes
const CACHE_PREFIX = 'content_blog';
const MIN_WORD_COUNT = 300;
const MAX_META_TITLE_LENGTH = 60;
const MAX_META_DESC_LENGTH = 160;
const IDEAL_KEYWORD_DENSITY_MIN = 0.01;
const IDEAL_KEYWORD_DENSITY_MAX = 0.03;

// ============================================================
// ContentBlogAgent
// ============================================================

export class ContentBlogAgent extends BaseAgent {
  constructor() {
    super({
      agentType: 'content_blog',
      model: 'sonnet',
      maxRetries: 3,
      timeoutMs: 120000,
      confidenceThreshold: 70,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns peer agent types that this agent is qualified to challenge.
   */
  getChallengeTargets(): AgentType[] {
    return ['localization', 'brand_consistency', 'shopify_integration'];
  }

  /**
   * Returns the system prompt used for AI content generation tasks.
   */
  getSystemPrompt(): string {
    return [
      'You are an expert SEO content strategist and blog writer for international e-commerce markets.',
      'You create high-quality, SEO-optimized long-form blog content that drives organic traffic and conversions.',
      'You understand cultural nuances, local search behaviors, and market-specific content strategies.',
      '',
      'Your responsibilities:',
      '- Research and identify high-value keywords for target markets',
      '- Write engaging, informative blog posts optimized for search engines',
      '- Structure content with proper headings (H1, H2, H3), paragraphs, and lists',
      '- Include relevant internal links to improve site architecture',
      '- Generate schema markup for rich search results',
      '- Adapt content tone and references for local audiences',
      '',
      'Always respond with valid JSON when asked for structured data.',
      'Never fabricate statistics or data points. Flag uncertainty when data is insufficient.',
    ].join('\n');
  }

  /**
   * Core processing pipeline for content and blog operations.
   *
   * Steps:
   * 1. Research SEO keywords for the target country/topic
   * 2. Generate long-form blog content via AI
   * 3. Add internal links based on existing content
   * 4. Generate schema markup
   * 5. Prepare Shopify publishing payload
   * 6. Handle content localization (if requested)
   * 7. Return AgentOutput with content plan and generated assets
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const uncertainties: string[] = [];

    this.log.info('ContentBlogAgent processing started', {
      requestId: input.requestId,
    });

    // ---- Extract and validate input parameters ----
    const topic = input.parameters.topic as string | undefined;
    const countryId = input.parameters.countryId as string | undefined;
    const targetLanguage = input.parameters.targetLanguage as string | undefined;
    const action = (input.parameters.action as string) || 'generate';

    if (!topic) {
      throw new ValidationError('Missing required parameter: topic', [
        { field: 'topic', message: 'A topic is required for content generation' },
      ]);
    }

    if (!countryId) {
      throw new ValidationError('Missing required parameter: countryId', [
        { field: 'countryId', message: 'A country ID is required for localized content' },
      ]);
    }

    // ---- Fetch country context ----
    const country = await this.fetchCountryData(countryId);
    if (!country) {
      uncertainties.push(
        this.flagUncertainty(
          'country_data',
          `No country record found for countryId=${countryId}. Using defaults.`,
        ),
      );
    }

    const language = targetLanguage || country?.language || 'en';

    // ---- Step 1: SEO Keyword Research ----
    this.log.info('Step 1: Researching SEO keywords', { topic, countryId });
    const keywordResearch = await this.researchKeywords(topic, countryId);

    if (keywordResearch.longTailKeywords.length === 0) {
      warnings.push('No long-tail keywords discovered; content may lack depth for niche queries.');
    }

    // ---- Step 2: Generate Blog Post ----
    this.log.info('Step 2: Generating blog post content', { topic, countryId });
    const blogPost = await this.generateBlogPost(
      topic,
      keywordResearch,
      countryId,
    );

    // ---- Step 3: Internal Linking ----
    this.log.info('Step 3: Generating internal links');
    const existingContent = await this.fetchExistingContent(countryId);
    const internalLinks = await this.generateInternalLinks(
      blogPost.body,
      existingContent,
    );
    blogPost.internalLinks = internalLinks;

    if (internalLinks.length === 0) {
      warnings.push('No internal links generated. Site may lack sufficient existing content for cross-linking.');
    }

    // ---- Step 4: Schema Markup ----
    this.log.info('Step 4: Generating schema markup');
    blogPost.schemaMarkup = this.generateSchemaMarkup(blogPost);

    // ---- Step 5: Shopify Payload ----
    this.log.info('Step 5: Preparing Shopify blog payload');
    const shopifyPayload = this.prepareForShopify(blogPost);

    // ---- Step 6: Content Localization (if non-English) ----
    let localizedBody = blogPost.body;
    if (language !== 'en' && action !== 'english_only') {
      this.log.info('Step 6: Localizing content', { language, countryId });
      localizedBody = await this.localizeContent(
        blogPost.body,
        language,
        countryId,
      );
      blogPost.body = localizedBody;
      blogPost.language = language;
    }

    // ---- Step 7: Calculate SEO Score ----
    this.log.info('Step 7: Calculating SEO score');
    const seoScore = this.calculateSEOScore(blogPost);

    if (seoScore.issues.length > 0) {
      warnings.push(...seoScore.issues.map((i) => `SEO issue: ${i}`));
    }

    // ---- Readability optimization ----
    if (blogPost.readabilityScore < 60) {
      this.log.info('Readability below threshold, optimizing');
      blogPost.body = await this.optimizeForReadability(blogPost.body);
    }

    // ---- Calculate confidence ----
    const confidence = this.calculateConfidence({
      keyword_research_quality: this.scoreKeywordResearchQuality(keywordResearch),
      content_length: blogPost.wordCount >= MIN_WORD_COUNT ? 85 : 40,
      seo_optimization: seoScore.overall,
      internal_linking: internalLinks.length > 0 ? 80 : 30,
      readability: blogPost.readabilityScore,
      localization: language === 'en' ? 90 : (localizedBody !== blogPost.body ? 75 : 50),
    });

    const processingTimeMs = Date.now() - startTime;

    // ---- Build output ----
    const output = this.buildOutput(
      `content_plan_generated`,
      {
        keywordResearch,
        blogPost,
        shopifyPayload,
        seoScore,
        internalLinks,
        language,
        countryId,
        processingTimeMs,
      },
      confidence,
      [
        `Generated SEO-optimized blog post for topic "${topic}" targeting country ${countryId}.`,
        `Primary keyword: "${keywordResearch.primaryKeyword}" with ${keywordResearch.secondaryKeywords.length} secondary keywords.`,
        `Post word count: ${blogPost.wordCount}. SEO score: ${seoScore.overall}/100.`,
        `${internalLinks.length} internal links added. Readability: ${blogPost.readabilityScore}/100.`,
      ].join(' '),
      this.buildRecommendations(seoScore, keywordResearch, blogPost),
      warnings,
      uncertainties,
    );

    // ---- Persist state and log decision ----
    await this.persistState({
      lastTopic: topic,
      lastCountryId: countryId,
      lastSEOScore: seoScore.overall,
      lastConfidence: confidence.score,
      processingTimeMs,
    });

    await this.logDecision(input, output);

    this.log.info('ContentBlogAgent processing complete', {
      requestId: input.requestId,
      confidence: confidence.score,
      processingTimeMs,
    });

    return output;
  }

  // ------------------------------------------------------------------
  // Public methods
  // ------------------------------------------------------------------

  /**
   * Researches SEO keywords for a given topic and country.
   * Uses AI to identify primary, secondary, and long-tail keywords
   * along with estimated search volume and difficulty scores.
   */
  async researchKeywords(
    topic: string,
    countryId: string,
  ): Promise<KeywordResearch> {
    const cacheKey = `${CACHE_PREFIX}:keywords:${countryId}:${topic.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = await cacheGet<KeywordResearch>(cacheKey);
    if (cached) {
      this.log.debug('Keyword research cache hit', { topic, countryId });
      return cached;
    }

    const country = await this.fetchCountryData(countryId);
    const countryContext = country
      ? `Target market: ${country.name} (${country.code}), language: ${country.language}, region: ${country.region}`
      : `Target country ID: ${countryId}`;

    const prompt = [
      `Research SEO keywords for the topic: "${topic}"`,
      countryContext,
      '',
      'Return a JSON object with this exact structure:',
      '{',
      '  "primaryKeyword": "the most relevant keyword phrase",',
      '  "secondaryKeywords": ["keyword2", "keyword3", ...],',
      '  "longTailKeywords": ["long tail phrase 1", "long tail phrase 2", ...],',
      '  "searchVolume": { "keyword": estimated_monthly_volume },',
      '  "difficulty": { "keyword": difficulty_score_0_to_100 }',
      '}',
      '',
      'Base your analysis on SEO best practices for the specified market.',
      'If you lack data for precise volume/difficulty estimates, provide reasonable ranges and note uncertainty.',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);

    const parsed = this.parseAIResponse<Omit<KeywordResearch, 'countryId'>>(aiResponse);

    const result: KeywordResearch = {
      primaryKeyword: parsed.primaryKeyword || topic,
      secondaryKeywords: Array.isArray(parsed.secondaryKeywords) ? parsed.secondaryKeywords : [],
      longTailKeywords: Array.isArray(parsed.longTailKeywords) ? parsed.longTailKeywords : [],
      searchVolume: parsed.searchVolume || {},
      difficulty: parsed.difficulty || {},
      countryId,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_KEYWORDS);
    return result;
  }

  /**
   * Generates a full long-form blog post using AI, optimized for the
   * given keywords and target country.
   */
  async generateBlogPost(
    topic: string,
    keywords: KeywordResearch,
    countryId: string,
  ): Promise<GeneratedBlogPost> {
    const country = await this.fetchCountryData(countryId);
    const language = country?.language || 'en';

    const prompt = [
      `Write a comprehensive, SEO-optimized blog post about: "${topic}"`,
      '',
      `Primary keyword: "${keywords.primaryKeyword}"`,
      `Secondary keywords: ${keywords.secondaryKeywords.join(', ')}`,
      `Long-tail keywords to incorporate: ${keywords.longTailKeywords.join(', ')}`,
      country ? `Target market: ${country.name}, language: ${language}` : '',
      '',
      'Requirements:',
      '- Write 1200-2000 words of high-quality, engaging content',
      '- Use proper HTML heading structure (H2, H3)',
      '- Include the primary keyword in the first paragraph',
      '- Naturally incorporate secondary and long-tail keywords',
      '- Write a compelling meta title (max 60 characters)',
      '- Write a meta description (max 160 characters) including the primary keyword',
      '- Structure with clear sections, bullet points where appropriate',
      '',
      'Return valid JSON with this structure:',
      '{',
      '  "title": "Blog Post Title",',
      '  "body": "<h2>...</h2><p>...</p>...",',
      '  "metaTitle": "SEO Meta Title",',
      '  "metaDescription": "SEO meta description..."',
      '}',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
    const parsed = this.parseAIResponse<{
      title: string;
      body: string;
      metaTitle: string;
      metaDescription: string;
    }>(aiResponse);

    const body = parsed.body || '';
    const wordCount = this.countWords(body);
    const readabilityScore = this.estimateReadability(body);
    const slug = this.generateSlug(parsed.title || topic);

    return {
      title: parsed.title || topic,
      slug,
      body,
      metaTitle: (parsed.metaTitle || '').slice(0, MAX_META_TITLE_LENGTH),
      metaDescription: (parsed.metaDescription || '').slice(0, MAX_META_DESC_LENGTH),
      keywords: [
        keywords.primaryKeyword,
        ...keywords.secondaryKeywords,
      ],
      internalLinks: [],
      schemaMarkup: { type: 'BlogPosting', data: {} },
      readabilityScore,
      wordCount,
      language,
      countryId,
    };
  }

  /**
   * Analyzes existing content and generates internal links that could
   * be inserted into the given content body. Matches are based on
   * keyword/topic relevance between the new content and existing posts.
   */
  async generateInternalLinks(
    content: string,
    existingPosts: Content[],
  ): Promise<InternalLink[]> {
    if (existingPosts.length === 0) {
      this.log.debug('No existing posts available for internal linking');
      return [];
    }

    const postSummaries = existingPosts.slice(0, 20).map((p) => ({
      id: p.id,
      title: p.title,
      keywords: p.seo_data?.keywords || [],
      slug: (p as Record<string, unknown>).slug || p.id,
    }));

    const prompt = [
      'Analyze the following blog content and suggest internal links to existing posts.',
      '',
      'New content (first 500 chars):',
      content.slice(0, 500),
      '',
      'Existing posts:',
      JSON.stringify(postSummaries),
      '',
      'Return a JSON array of link suggestions:',
      '[{ "text": "anchor text", "url": "/blog/slug", "targetContentId": "post-id" }]',
      '',
      'Only suggest links where there is genuine topical relevance.',
      'Limit to 5 most relevant links maximum.',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
    const parsed = this.parseAIResponse<InternalLink[]>(aiResponse);

    if (!Array.isArray(parsed)) {
      this.log.warn('AI returned non-array for internal links, returning empty');
      return [];
    }

    return parsed
      .filter(
        (link) =>
          link &&
          typeof link.text === 'string' &&
          typeof link.url === 'string' &&
          typeof link.targetContentId === 'string',
      )
      .slice(0, 5);
  }

  /**
   * Generates JSON-LD schema markup for a blog post.
   * Produces a BlogPosting schema following schema.org specifications.
   */
  generateSchemaMarkup(post: GeneratedBlogPost): SchemaMarkup {
    const schemaData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.metaDescription,
      wordCount: post.wordCount,
      inLanguage: post.language,
      keywords: post.keywords.join(', '),
      url: `/blog/${post.slug}`,
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    };

    if (post.metaTitle) {
      schemaData.name = post.metaTitle;
    }

    return {
      type: 'BlogPosting',
      data: schemaData,
    };
  }

  /**
   * Prepares a blog post for publishing via the Shopify Blog API.
   * Transforms the generated post into Shopify's expected payload format.
   */
  prepareForShopify(post: GeneratedBlogPost): ShopifyBlogPayload {
    const schemaScript = `<script type="application/ld+json">${JSON.stringify(post.schemaMarkup.data)}</script>`;
    const bodyWithSchema = `${post.body}\n${schemaScript}`;

    const metafields: Record<string, unknown>[] = [
      {
        namespace: 'seo',
        key: 'meta_title',
        value: post.metaTitle,
        type: 'single_line_text_field',
      },
      {
        namespace: 'seo',
        key: 'meta_description',
        value: post.metaDescription,
        type: 'single_line_text_field',
      },
      {
        namespace: 'content',
        key: 'language',
        value: post.language,
        type: 'single_line_text_field',
      },
      {
        namespace: 'content',
        key: 'country_id',
        value: post.countryId,
        type: 'single_line_text_field',
      },
    ];

    return {
      title: post.title,
      body_html: bodyWithSchema,
      tags: post.keywords.join(', '),
      published: false, // Always draft first, require explicit publish
      metafields,
    };
  }

  /**
   * Calculates a composite SEO score for a generated blog post.
   * Evaluates title optimization, meta tags, keyword density,
   * readability, and internal links.
   */
  calculateSEOScore(post: GeneratedBlogPost): SEOScore {
    const issues: string[] = [];

    // ---- Title optimization (0-100) ----
    let titleOptimization = 0;
    if (post.metaTitle.length > 0) {
      titleOptimization += 30;
      if (post.metaTitle.length <= MAX_META_TITLE_LENGTH) {
        titleOptimization += 20;
      } else {
        issues.push(`Meta title exceeds ${MAX_META_TITLE_LENGTH} characters (${post.metaTitle.length})`);
      }
      const primaryKw = post.keywords[0];
      if (primaryKw && post.metaTitle.toLowerCase().includes(primaryKw.toLowerCase())) {
        titleOptimization += 30;
      } else {
        issues.push('Primary keyword missing from meta title');
      }
      if (post.title.length > 0) {
        titleOptimization += 20;
      }
    } else {
      issues.push('Meta title is empty');
    }

    // ---- Meta description optimization (0-100) ----
    let metaOptimization = 0;
    if (post.metaDescription.length > 0) {
      metaOptimization += 30;
      if (post.metaDescription.length <= MAX_META_DESC_LENGTH) {
        metaOptimization += 20;
      } else {
        issues.push(`Meta description exceeds ${MAX_META_DESC_LENGTH} characters`);
      }
      const primaryKw = post.keywords[0];
      if (primaryKw && post.metaDescription.toLowerCase().includes(primaryKw.toLowerCase())) {
        metaOptimization += 30;
      } else {
        issues.push('Primary keyword missing from meta description');
      }
      if (post.metaDescription.length >= 120) {
        metaOptimization += 20;
      }
    } else {
      issues.push('Meta description is empty');
    }

    // ---- Keyword density (0-100) ----
    let keywordDensity = 0;
    const primaryKw = post.keywords[0];
    if (primaryKw && post.wordCount > 0) {
      const bodyLower = post.body.toLowerCase();
      const kwLower = primaryKw.toLowerCase();
      const occurrences = (bodyLower.split(kwLower).length - 1);
      const density = occurrences / post.wordCount;

      if (density >= IDEAL_KEYWORD_DENSITY_MIN && density <= IDEAL_KEYWORD_DENSITY_MAX) {
        keywordDensity = 100;
      } else if (density < IDEAL_KEYWORD_DENSITY_MIN) {
        keywordDensity = Math.round((density / IDEAL_KEYWORD_DENSITY_MIN) * 70);
        issues.push('Keyword density is below optimal range');
      } else {
        keywordDensity = Math.max(0, 100 - Math.round(((density - IDEAL_KEYWORD_DENSITY_MAX) / IDEAL_KEYWORD_DENSITY_MAX) * 100));
        issues.push('Keyword density exceeds optimal range (potential keyword stuffing)');
      }
    } else {
      issues.push('Unable to calculate keyword density');
    }

    // ---- Readability (0-100) ----
    const readability = post.readabilityScore;
    if (readability < 50) {
      issues.push(`Readability score is low (${readability}/100)`);
    }

    // ---- Internal links score (0-100) ----
    let internalLinksScore = 0;
    const linkCount = post.internalLinks.length;
    if (linkCount >= 3) {
      internalLinksScore = 100;
    } else if (linkCount > 0) {
      internalLinksScore = Math.round((linkCount / 3) * 100);
    }
    if (linkCount === 0) {
      issues.push('No internal links found in the content');
    }

    // ---- Word count check ----
    if (post.wordCount < MIN_WORD_COUNT) {
      issues.push(`Content is short (${post.wordCount} words). Aim for at least ${MIN_WORD_COUNT} words.`);
    }

    // ---- Composite score ----
    const overall = Math.round(
      titleOptimization * 0.2 +
      metaOptimization * 0.2 +
      keywordDensity * 0.2 +
      readability * 0.2 +
      internalLinksScore * 0.2,
    );

    return {
      overall,
      titleOptimization,
      metaOptimization,
      keywordDensity,
      readability,
      internalLinks: internalLinksScore,
      issues,
    };
  }

  /**
   * Localizes content into a target language, adapting for cultural
   * nuances specific to the target country.
   */
  async localizeContent(
    content: string,
    targetLanguage: string,
    countryId: string,
  ): Promise<string> {
    const country = await this.fetchCountryData(countryId);
    const culturalContext = country?.cultural_behavior
      ? `Cultural considerations: ${JSON.stringify(country.cultural_behavior)}`
      : '';

    const prompt = [
      `Translate and culturally adapt the following blog content into ${targetLanguage}.`,
      '',
      culturalContext,
      '',
      'Requirements:',
      '- Maintain the HTML structure and formatting',
      '- Adapt idioms and cultural references for the target market',
      '- Preserve SEO keyword placement patterns',
      '- Keep technical terms where appropriate for the market',
      '- Maintain a natural, engaging tone in the target language',
      '',
      'Content to localize:',
      content,
      '',
      'Return ONLY the translated HTML content, no JSON wrapping.',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
    return aiResponse.trim();
  }

  /**
   * Analyzes the performance of a published content piece by querying
   * stored analytics data from the database.
   */
  async analyzeContentPerformance(
    contentId: string,
  ): Promise<ContentPerformance> {
    try {
      const result = await pool.query(
        `SELECT
           COALESCE(SUM((metrics->>'views')::int), 0) AS views,
           COALESCE(AVG((metrics->>'avg_time_on_page')::float), 0) AS avg_time_on_page,
           COALESCE(AVG((metrics->>'bounce_rate')::float), 0) AS bounce_rate,
           COALESCE(SUM((metrics->>'conversions')::int), 0) AS conversions
         FROM content_analytics
         WHERE content_id = $1`,
        [contentId],
      );

      if (result.rows.length === 0 || !result.rows[0]) {
        this.log.warn('No performance data found for content', { contentId });
        return { views: 0, avgTimeOnPage: 0, bounceRate: 0, conversions: 0 };
      }

      const row = result.rows[0];
      return {
        views: Number(row.views) || 0,
        avgTimeOnPage: Number(row.avg_time_on_page) || 0,
        bounceRate: Number(row.bounce_rate) || 0,
        conversions: Number(row.conversions) || 0,
      };
    } catch (error) {
      this.log.error('Failed to analyze content performance', {
        contentId,
        error,
      });
      return { views: 0, avgTimeOnPage: 0, bounceRate: 0, conversions: 0 };
    }
  }

  /**
   * Suggests content topics for a target country based on market data,
   * trending search terms, and existing content gaps.
   */
  async suggestContentTopics(
    countryId: string,
  ): Promise<TopicSuggestion[]> {
    const cacheKey = `${CACHE_PREFIX}:topics:${countryId}`;
    const cached = await cacheGet<TopicSuggestion[]>(cacheKey);
    if (cached) {
      this.log.debug('Topic suggestions cache hit', { countryId });
      return cached;
    }

    const country = await this.fetchCountryData(countryId);
    const existingContent = await this.fetchExistingContent(countryId);
    const existingTopics = existingContent.map((c) => c.title).join(', ');

    const prompt = [
      `Suggest 5-10 blog content topics for the ${country?.name || countryId} market.`,
      '',
      country ? `Market info: region=${country.region}, language=${country.language}` : '',
      existingTopics ? `Already covered topics (avoid duplicates): ${existingTopics}` : '',
      '',
      'Return a JSON array:',
      '[{',
      '  "topic": "Topic title",',
      '  "relevanceScore": 0-100,',
      '  "expectedTraffic": estimated_monthly_visits,',
      '  "competition": "low" | "medium" | "high"',
      '}]',
      '',
      'Focus on topics with high relevance and low-to-medium competition.',
      'If you cannot estimate traffic precisely, provide a reasonable range and flag it.',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
    const parsed = this.parseAIResponse<TopicSuggestion[]>(aiResponse);

    const suggestions = Array.isArray(parsed)
      ? parsed.filter(
          (s) =>
            s &&
            typeof s.topic === 'string' &&
            typeof s.relevanceScore === 'number',
        )
      : [];

    await cacheSet(cacheKey, suggestions, CACHE_TTL_TOPICS);
    return suggestions;
  }

  /**
   * Optimizes content for readability by simplifying sentence structure,
   * improving paragraph flow, and ensuring appropriate reading level.
   */
  async optimizeForReadability(content: string): Promise<string> {
    const prompt = [
      'Optimize the following blog content for readability.',
      '',
      'Guidelines:',
      '- Break long sentences into shorter, clearer ones',
      '- Use active voice where possible',
      '- Ensure paragraphs are 2-4 sentences',
      '- Add transition words between sections',
      '- Maintain all HTML structure and formatting',
      '- Preserve SEO keywords and their placement',
      '- Do not change the core meaning or remove information',
      '',
      'Content to optimize:',
      content,
      '',
      'Return ONLY the optimized HTML content, no JSON wrapping.',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
    return aiResponse.trim();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Parses an AI text response, extracting JSON from the response body.
   * Handles common cases like markdown code fences wrapping JSON.
   */
  private parseAIResponse<T>(raw: string): T {
    let cleaned = raw.trim();

    // Strip markdown code fences if present
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      this.log.warn('Failed to parse AI response as JSON, attempting extraction', {
        rawLength: raw.length,
        error: error instanceof Error ? error.message : String(error),
      });

      // Attempt to find the first JSON object or array in the response
      const objectMatch = cleaned.match(/(\{[\s\S]*\})/);
      const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
      const match = objectMatch || arrayMatch;

      if (match) {
        try {
          return JSON.parse(match[1]) as T;
        } catch {
          // Fall through to throw
        }
      }

      throw new ExternalServiceError(
        'ai_response_parse',
        'Failed to parse AI response as valid JSON',
      );
    }
  }

  /**
   * Fetches country data from the database by ID.
   */
  private async fetchCountryData(
    countryId: string,
  ): Promise<Record<string, unknown> | null> {
    const cacheKey = `${CACHE_PREFIX}:country:${countryId}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    try {
      const result = await pool.query(
        'SELECT * FROM countries WHERE id = $1 AND is_active = true LIMIT 1',
        [countryId],
      );

      if (result.rows.length === 0) return null;

      const country = result.rows[0] as Record<string, unknown>;
      await cacheSet(cacheKey, country, CACHE_TTL_KEYWORDS);
      return country;
    } catch (error) {
      this.log.error('Failed to fetch country data', { countryId, error });
      return null;
    }
  }

  /**
   * Fetches existing published content for a given country to use
   * in internal link generation and topic gap analysis.
   */
  private async fetchExistingContent(countryId: string): Promise<Content[]> {
    try {
      const result = await pool.query(
        `SELECT id, title, body, status, seo_data, country_id, language,
                shopify_id, published_at, created_by, created_at, updated_at
         FROM content
         WHERE country_id = $1 AND status = 'published'
         ORDER BY published_at DESC
         LIMIT 50`,
        [countryId],
      );

      return result.rows as Content[];
    } catch (error) {
      this.log.error('Failed to fetch existing content', { countryId, error });
      return [];
    }
  }

  /**
   * Generates a URL-safe slug from a title string.
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
  }

  /**
   * Counts words in an HTML string by stripping tags first.
   */
  private countWords(html: string): number {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length === 0) return 0;
    return text.split(' ').length;
  }

  /**
   * Estimates a readability score (0-100) based on average sentence
   * length and average word length. A simplified proxy for Flesch-Kincaid.
   */
  private estimateReadability(html: string): number {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length === 0) return 0;

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.split(/\s+/);

    if (sentences.length === 0 || words.length === 0) return 0;

    const avgSentenceLength = words.length / sentences.length;
    const avgWordLength =
      words.reduce((sum, w) => sum + w.length, 0) / words.length;

    // Simplified Flesch-like score: penalize long sentences and complex words
    const score = Math.max(
      0,
      Math.min(100, Math.round(100 - (avgSentenceLength - 15) * 2 - (avgWordLength - 5) * 10)),
    );

    return score;
  }

  /**
   * Scores the quality of keyword research results (0-100).
   */
  private scoreKeywordResearchQuality(research: KeywordResearch): number {
    let score = 0;

    if (research.primaryKeyword.length > 0) score += 30;
    if (research.secondaryKeywords.length >= 3) score += 25;
    else if (research.secondaryKeywords.length > 0) score += 10;
    if (research.longTailKeywords.length >= 3) score += 25;
    else if (research.longTailKeywords.length > 0) score += 10;
    if (Object.keys(research.searchVolume).length > 0) score += 10;
    if (Object.keys(research.difficulty).length > 0) score += 10;

    return Math.min(100, score);
  }

  /**
   * Builds actionable recommendations based on SEO analysis.
   */
  private buildRecommendations(
    seoScore: SEOScore,
    keywords: KeywordResearch,
    post: GeneratedBlogPost,
  ): string[] {
    const recommendations: string[] = [];

    if (seoScore.titleOptimization < 70) {
      recommendations.push(
        `Improve meta title: include primary keyword "${keywords.primaryKeyword}" and keep under ${MAX_META_TITLE_LENGTH} characters.`,
      );
    }

    if (seoScore.metaOptimization < 70) {
      recommendations.push(
        `Optimize meta description: include primary keyword and target 120-${MAX_META_DESC_LENGTH} characters.`,
      );
    }

    if (seoScore.keywordDensity < 50) {
      recommendations.push(
        `Increase usage of primary keyword "${keywords.primaryKeyword}" throughout the content.`,
      );
    } else if (seoScore.keywordDensity > 90 && seoScore.issues.some((i) => i.includes('stuffing'))) {
      recommendations.push(
        'Reduce keyword repetition to avoid search engine penalties for keyword stuffing.',
      );
    }

    if (seoScore.readability < 60) {
      recommendations.push(
        'Improve readability: use shorter sentences, simpler vocabulary, and more paragraph breaks.',
      );
    }

    if (seoScore.internalLinks < 60) {
      recommendations.push(
        'Add more internal links to related content to improve site architecture and SEO.',
      );
    }

    if (post.wordCount < 1000) {
      recommendations.push(
        `Expand content to at least 1000 words for better SEO ranking potential (current: ${post.wordCount}).`,
      );
    }

    if (keywords.longTailKeywords.length > 0) {
      recommendations.push(
        `Consider creating supplementary content targeting long-tail keywords: ${keywords.longTailKeywords.slice(0, 3).join(', ')}.`,
      );
    }

    return recommendations;
  }
}

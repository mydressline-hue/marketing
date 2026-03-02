/**
 * Unit tests for ContentBlogAgent (Agent 5).
 *
 * All external dependencies (database, Redis, AI client, helpers) are mocked
 * so that we exercise only the agent logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks – declared before imports so Jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    ANTHROPIC_API_KEY: 'test-api-key',
    ANTHROPIC_OPUS_MODEL: 'claude-opus-4-20250514',
    ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
    LOG_LEVEL: 'error',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1234'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock the ConfidenceScoring module used by BaseAgent
jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: jest.fn().mockImplementation((score: number) => {
    if (score >= 90) return 'very_high';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ContentBlogAgent } from '../../../src/agents/modules/ContentBlogAgent';
import type {
  KeywordResearch,
  GeneratedBlogPost,
  SchemaMarkup,
  SEOScore,
  ShopifyBlogPayload,
} from '../../../src/agents/modules/ContentBlogAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import type { AgentInput } from '../../../src/agents/base/types';
import type { Content } from '../../../src/types';

// Typed mocks for convenience
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a standard agent input payload for tests.
 */
function makeInput(overrides: Partial<AgentInput['parameters']> = {}): AgentInput {
  return {
    context: {},
    parameters: {
      topic: 'sustainable fashion trends',
      countryId: 'country-de-001',
      targetLanguage: 'en',
      action: 'generate',
      ...overrides,
    },
    requestId: 'test-request-001',
  };
}

/**
 * A sample keyword research result used in AI mock responses.
 */
const SAMPLE_KEYWORD_RESEARCH = {
  primaryKeyword: 'sustainable fashion',
  secondaryKeywords: ['eco-friendly clothing', 'green fashion', 'ethical style'],
  longTailKeywords: [
    'sustainable fashion trends 2026',
    'best eco-friendly clothing brands germany',
    'how to build a sustainable wardrobe',
  ],
  searchVolume: {
    'sustainable fashion': 12000,
    'eco-friendly clothing': 6500,
    'green fashion': 3200,
  },
  difficulty: {
    'sustainable fashion': 65,
    'eco-friendly clothing': 45,
    'green fashion': 35,
  },
};

/**
 * A sample blog post AI response.
 */
const SAMPLE_BLOG_RESPONSE = {
  title: 'Sustainable Fashion Trends to Watch in 2026',
  body: '<h2>Introduction to Sustainable Fashion</h2><p>Sustainable fashion is transforming the way we think about clothing and style. In this comprehensive guide, we explore the latest sustainable fashion trends shaping the industry.</p><h2>Top Trends</h2><p>From eco-friendly fabrics to circular fashion models, here are the key sustainable fashion movements.</p><p>Organic cotton continues to gain popularity as consumers demand transparency.</p><h3>Ethical Manufacturing</h3><p>Brands are increasingly committed to fair labor practices and sustainable fashion supply chains.</p>',
  metaTitle: 'Sustainable Fashion Trends 2026 | Eco Guide',
  metaDescription: 'Discover the top sustainable fashion trends for 2026. Learn about eco-friendly clothing, ethical style, and how to build a green wardrobe.',
};

/**
 * Sample internal links AI response.
 */
const SAMPLE_INTERNAL_LINKS = [
  {
    text: 'eco-friendly fabrics guide',
    url: '/blog/eco-friendly-fabrics',
    targetContentId: 'content-001',
  },
  {
    text: 'ethical clothing brands',
    url: '/blog/ethical-brands',
    targetContentId: 'content-002',
  },
];

/**
 * Sample existing content rows from the database.
 */
const SAMPLE_EXISTING_CONTENT: Content[] = [
  {
    id: 'content-001',
    title: 'Guide to Eco-Friendly Fabrics',
    body: '<p>A deep dive into sustainable materials.</p>',
    status: 'published',
    seo_data: {
      keywords: ['eco fabrics', 'sustainable materials'],
      meta_title: 'Eco Fabrics',
      meta_description: 'Guide to eco fabrics',
      internal_links: [],
      readability_score: 75,
    },
    country_id: 'country-de-001',
    language: 'en',
    published_at: '2025-12-01T00:00:00Z',
    created_by: 'user-001',
    created_at: '2025-11-01T00:00:00Z',
    updated_at: '2025-12-01T00:00:00Z',
  },
  {
    id: 'content-002',
    title: 'Ethical Clothing Brands in Germany',
    body: '<p>Top ethical brands available in the German market.</p>',
    status: 'published',
    seo_data: {
      keywords: ['ethical brands', 'german fashion'],
      meta_title: 'Ethical Brands Germany',
      meta_description: 'Ethical clothing brands',
      internal_links: [],
      readability_score: 80,
    },
    country_id: 'country-de-001',
    language: 'en',
    published_at: '2025-11-15T00:00:00Z',
    created_by: 'user-001',
    created_at: '2025-10-15T00:00:00Z',
    updated_at: '2025-11-15T00:00:00Z',
  },
];

const SAMPLE_COUNTRY_ROW = {
  id: 'country-de-001',
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'de',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  is_active: true,
  cultural_behavior: { tone: 'formal', directness: 'high' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentBlogAgent', () => {
  let agent: ContentBlogAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new ContentBlogAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & config
  // -----------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('creates agent with correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('content_blog');
      expect(agent.getConfig().model).toBe('sonnet');
      expect(agent.getConfig().maxRetries).toBe(3);
      expect(agent.getConfig().timeoutMs).toBe(120000);
      expect(agent.getConfig().confidenceThreshold).toBe(70);
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['localization', 'brand_consistency', 'shopify_integration']);
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a system prompt that covers SEO and content responsibilities', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toContain('SEO');
      expect(prompt).toContain('blog');
      expect(prompt).toContain('international');
      expect(prompt).toContain('schema markup');
      expect(prompt).toContain('valid JSON');
    });
  });

  // -----------------------------------------------------------------------
  // generateSchemaMarkup
  // -----------------------------------------------------------------------

  describe('generateSchemaMarkup', () => {
    it('generates valid BlogPosting schema markup', () => {
      const post: GeneratedBlogPost = {
        title: 'Test Post',
        slug: 'test-post',
        body: '<p>Test body content</p>',
        metaTitle: 'Test Meta Title',
        metaDescription: 'A test meta description for the blog post.',
        keywords: ['test keyword', 'second keyword'],
        internalLinks: [],
        schemaMarkup: { type: 'BlogPosting', data: {} },
        readabilityScore: 75,
        wordCount: 500,
        language: 'en',
        countryId: 'country-us-001',
      };

      const schema = agent.generateSchemaMarkup(post);

      expect(schema.type).toBe('BlogPosting');
      expect(schema.data['@context']).toBe('https://schema.org');
      expect(schema.data['@type']).toBe('BlogPosting');
      expect(schema.data['headline']).toBe('Test Post');
      expect(schema.data['description']).toBe('A test meta description for the blog post.');
      expect(schema.data['wordCount']).toBe(500);
      expect(schema.data['inLanguage']).toBe('en');
      expect(schema.data['keywords']).toBe('test keyword, second keyword');
      expect(schema.data['url']).toBe('/blog/test-post');
      expect(schema.data['name']).toBe('Test Meta Title');
      expect(schema.data['datePublished']).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // prepareForShopify
  // -----------------------------------------------------------------------

  describe('prepareForShopify', () => {
    it('produces correct Shopify blog payload with metafields', () => {
      const post: GeneratedBlogPost = {
        title: 'Shopify Test Post',
        slug: 'shopify-test-post',
        body: '<p>Blog content goes here.</p>',
        metaTitle: 'Shopify Test',
        metaDescription: 'Meta description for Shopify.',
        keywords: ['shopify', 'e-commerce'],
        internalLinks: [],
        schemaMarkup: {
          type: 'BlogPosting',
          data: { '@type': 'BlogPosting', headline: 'Shopify Test Post' },
        },
        readabilityScore: 80,
        wordCount: 1000,
        language: 'en',
        countryId: 'country-us-001',
      };

      const payload: ShopifyBlogPayload = agent.prepareForShopify(post);

      expect(payload.title).toBe('Shopify Test Post');
      expect(payload.body_html).toContain('<p>Blog content goes here.</p>');
      expect(payload.body_html).toContain('application/ld+json');
      expect(payload.tags).toBe('shopify, e-commerce');
      expect(payload.published).toBe(false); // Always draft first
      expect(payload.metafields).toBeDefined();
      expect(payload.metafields!.length).toBe(4);

      const metaTitleField = payload.metafields!.find(
        (m) => m.key === 'meta_title',
      );
      expect(metaTitleField).toBeDefined();
      expect(metaTitleField!.value).toBe('Shopify Test');
    });
  });

  // -----------------------------------------------------------------------
  // calculateSEOScore
  // -----------------------------------------------------------------------

  describe('calculateSEOScore', () => {
    it('returns high score for well-optimized post', () => {
      const post: GeneratedBlogPost = {
        title: 'Sustainable Fashion Trends Guide',
        slug: 'sustainable-fashion-trends-guide',
        body: '<h2>Sustainable Fashion</h2><p>Sustainable fashion is the future of the industry. ' +
          'In this guide, we explore how sustainable fashion is reshaping what we wear. ' +
          'Sustainable fashion brands are leading the change.</p>' +
          '<p>More content about sustainable fashion and eco-friendly choices.</p>'.repeat(10),
        metaTitle: 'Sustainable Fashion Trends 2026',
        metaDescription: 'Explore the top sustainable fashion trends for 2026. Learn about eco-friendly clothing and ethical style.',
        keywords: ['sustainable fashion', 'eco-friendly clothing'],
        internalLinks: [
          { text: 'eco guide', url: '/blog/eco-guide', targetContentId: 'c1' },
          { text: 'style tips', url: '/blog/style', targetContentId: 'c2' },
          { text: 'brands', url: '/blog/brands', targetContentId: 'c3' },
        ],
        schemaMarkup: { type: 'BlogPosting', data: {} },
        readabilityScore: 80,
        wordCount: 1500,
        language: 'en',
        countryId: 'country-de-001',
      };

      const score: SEOScore = agent.calculateSEOScore(post);

      expect(score.overall).toBeGreaterThan(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(score.titleOptimization).toBeGreaterThan(50);
      expect(score.metaOptimization).toBeGreaterThan(50);
      expect(score.internalLinks).toBe(100); // 3+ links = 100
      expect(score.readability).toBe(80);
      expect(typeof score.keywordDensity).toBe('number');
    });

    it('flags issues for a poorly optimized post', () => {
      const post: GeneratedBlogPost = {
        title: 'Test',
        slug: 'test',
        body: '<p>Short.</p>',
        metaTitle: '',
        metaDescription: '',
        keywords: ['target keyword'],
        internalLinks: [],
        schemaMarkup: { type: 'BlogPosting', data: {} },
        readabilityScore: 30,
        wordCount: 2,
        language: 'en',
        countryId: 'country-us-001',
      };

      const score: SEOScore = agent.calculateSEOScore(post);

      expect(score.overall).toBeLessThan(40);
      expect(score.issues.length).toBeGreaterThan(0);
      expect(score.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Meta title is empty'),
          expect.stringContaining('Meta description is empty'),
          expect.stringContaining('No internal links'),
        ]),
      );
      expect(score.internalLinks).toBe(0);
    });

    it('detects keyword density issues', () => {
      // Create content where keyword density is below minimum
      const post: GeneratedBlogPost = {
        title: 'General Topic Discussion',
        slug: 'general-topic',
        body: '<p>This is a general discussion about various themes in the modern world.</p>'.repeat(5),
        metaTitle: 'General Topic Guide',
        metaDescription: 'A comprehensive overview of general topics in fashion and beyond.',
        keywords: ['sustainable fashion'],
        internalLinks: [],
        schemaMarkup: { type: 'BlogPosting', data: {} },
        readabilityScore: 70,
        wordCount: 80,
        language: 'en',
        countryId: 'country-us-001',
      };

      const score = agent.calculateSEOScore(post);

      // Keyword 'sustainable fashion' does not appear in body at all
      expect(score.keywordDensity).toBe(0);
      expect(score.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Keyword density'),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // researchKeywords (with AI mock)
  // -----------------------------------------------------------------------

  describe('researchKeywords', () => {
    it('returns cached result when available', async () => {
      const cachedResult: KeywordResearch = {
        ...SAMPLE_KEYWORD_RESEARCH,
        countryId: 'country-de-001',
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await agent.researchKeywords(
        'sustainable fashion',
        'country-de-001',
      );

      expect(result).toEqual(cachedResult);
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('calls AI and caches result on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null); // cache miss

      // Country lookup (fetchCountryData): cache miss then DB hit
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_COUNTRY_ROW] });

      // Mock callAI by spying on the prototype
      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_KEYWORD_RESEARCH));

      const result = await agent.researchKeywords(
        'sustainable fashion trends',
        'country-de-001',
      );

      expect(result.primaryKeyword).toBe('sustainable fashion');
      expect(result.secondaryKeywords).toHaveLength(3);
      expect(result.longTailKeywords).toHaveLength(3);
      expect(result.countryId).toBe('country-de-001');
      expect(mockCacheSet).toHaveBeenCalled();

      callAISpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // generateBlogPost
  // -----------------------------------------------------------------------

  describe('generateBlogPost', () => {
    it('generates a blog post with correct structure', async () => {
      // Country lookup
      mockCacheGet.mockResolvedValueOnce(SAMPLE_COUNTRY_ROW);

      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BLOG_RESPONSE));

      const keywords: KeywordResearch = {
        ...SAMPLE_KEYWORD_RESEARCH,
        countryId: 'country-de-001',
      };

      const post = await agent.generateBlogPost(
        'sustainable fashion trends',
        keywords,
        'country-de-001',
      );

      expect(post.title).toBe(SAMPLE_BLOG_RESPONSE.title);
      expect(post.slug).toBe('sustainable-fashion-trends-to-watch-in-2026');
      expect(post.body).toContain('<h2>');
      expect(post.metaTitle.length).toBeLessThanOrEqual(60);
      expect(post.metaDescription.length).toBeLessThanOrEqual(160);
      expect(post.keywords).toContain('sustainable fashion');
      expect(post.wordCount).toBeGreaterThan(0);
      expect(post.language).toBe('de'); // From country data
      expect(post.countryId).toBe('country-de-001');

      callAISpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // generateInternalLinks
  // -----------------------------------------------------------------------

  describe('generateInternalLinks', () => {
    it('returns empty array when no existing posts', async () => {
      const links = await agent.generateInternalLinks('<p>Some content</p>', []);
      expect(links).toEqual([]);
    });

    it('generates links from AI analysis of existing content', async () => {
      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_INTERNAL_LINKS));

      const links = await agent.generateInternalLinks(
        '<p>Content about sustainable fashion and eco-friendly fabrics.</p>',
        SAMPLE_EXISTING_CONTENT,
      );

      expect(links).toHaveLength(2);
      expect(links[0].text).toBe('eco-friendly fabrics guide');
      expect(links[0].url).toBe('/blog/eco-friendly-fabrics');
      expect(links[0].targetContentId).toBe('content-001');

      callAISpy.mockRestore();
    });

    it('limits to 5 links maximum', async () => {
      const manyLinks = Array.from({ length: 8 }, (_, i) => ({
        text: `link ${i}`,
        url: `/blog/post-${i}`,
        targetContentId: `content-${i}`,
      }));

      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(JSON.stringify(manyLinks));

      const links = await agent.generateInternalLinks(
        '<p>Some content</p>',
        SAMPLE_EXISTING_CONTENT,
      );

      expect(links.length).toBeLessThanOrEqual(5);

      callAISpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // localizeContent
  // -----------------------------------------------------------------------

  describe('localizeContent', () => {
    it('calls AI with cultural context for translation', async () => {
      // Country lookup
      mockCacheGet.mockResolvedValueOnce(SAMPLE_COUNTRY_ROW);

      const translatedContent = '<h2>Nachhaltige Mode</h2><p>Nachhaltige Mode verändert die Branche.</p>';

      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(translatedContent);

      const result = await agent.localizeContent(
        '<h2>Sustainable Fashion</h2><p>Sustainable fashion is changing the industry.</p>',
        'de',
        'country-de-001',
      );

      expect(result).toBe(translatedContent);
      expect(callAISpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('culturally adapt'),
      );

      callAISpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // analyzeContentPerformance
  // -----------------------------------------------------------------------

  describe('analyzeContentPerformance', () => {
    it('returns performance data from database', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            views: 1500,
            avg_time_on_page: 185.5,
            bounce_rate: 42.3,
            conversions: 23,
          },
        ],
      });

      const perf = await agent.analyzeContentPerformance('content-001');

      expect(perf.views).toBe(1500);
      expect(perf.avgTimeOnPage).toBe(185.5);
      expect(perf.bounceRate).toBe(42.3);
      expect(perf.conversions).toBe(23);
    });

    it('returns zeros when no performance data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const perf = await agent.analyzeContentPerformance('nonexistent');

      expect(perf.views).toBe(0);
      expect(perf.avgTimeOnPage).toBe(0);
      expect(perf.bounceRate).toBe(0);
      expect(perf.conversions).toBe(0);
    });

    it('handles database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const perf = await agent.analyzeContentPerformance('content-001');

      expect(perf.views).toBe(0);
      expect(perf.avgTimeOnPage).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // suggestContentTopics
  // -----------------------------------------------------------------------

  describe('suggestContentTopics', () => {
    it('returns AI-generated topic suggestions', async () => {
      const suggestions = [
        { topic: 'Circular Fashion in Germany', relevanceScore: 92, expectedTraffic: 5000, competition: 'low' },
        { topic: 'German Sustainable Brands Review', relevanceScore: 85, expectedTraffic: 3500, competition: 'medium' },
      ];

      // Cache miss for topics
      mockCacheGet.mockResolvedValueOnce(null);
      // Country lookup
      mockCacheGet.mockResolvedValueOnce(SAMPLE_COUNTRY_ROW);
      // Existing content query
      mockQuery.mockResolvedValueOnce({ rows: SAMPLE_EXISTING_CONTENT });

      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(JSON.stringify(suggestions));

      const result = await agent.suggestContentTopics('country-de-001');

      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe('Circular Fashion in Germany');
      expect(result[0].relevanceScore).toBe(92);
      expect(result[1].competition).toBe('medium');
      expect(mockCacheSet).toHaveBeenCalled();

      callAISpy.mockRestore();
    });

    it('returns cached suggestions when available', async () => {
      const cachedSuggestions = [
        { topic: 'Cached Topic', relevanceScore: 80, expectedTraffic: 2000, competition: 'low' },
      ];
      mockCacheGet.mockResolvedValueOnce(cachedSuggestions);

      const result = await agent.suggestContentTopics('country-de-001');

      expect(result).toEqual(cachedSuggestions);
    });
  });

  // -----------------------------------------------------------------------
  // process (full pipeline)
  // -----------------------------------------------------------------------

  describe('process (full pipeline)', () => {
    it('executes the complete content generation pipeline', async () => {
      // Set up all AI call mocks in sequence
      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        // Step 1: researchKeywords
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_KEYWORD_RESEARCH))
        // Step 2: generateBlogPost
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BLOG_RESPONSE))
        // Step 3: generateInternalLinks
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_INTERNAL_LINKS));

      // Cache lookups - all country lookups return the sample country row by default
      mockCacheGet.mockResolvedValue(SAMPLE_COUNTRY_ROW);
      // Override specific calls in order:
      // #1: fetchCountryData in process() -> country found (use default)
      // #2: keyword research cache -> miss (need null)
      // The rest use the default SAMPLE_COUNTRY_ROW
      mockCacheGet
        .mockResolvedValueOnce(SAMPLE_COUNTRY_ROW) // #1 fetchCountryData in process()
        .mockResolvedValueOnce(null);               // #2 keyword cache miss in researchKeywords

      // Existing content query (for internal links)
      mockQuery.mockResolvedValueOnce({ rows: SAMPLE_EXISTING_CONTENT });
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input = makeInput();
      const output = await agent.process(input);

      expect(output.agentType).toBe('content_blog');
      expect(output.decision).toBe('content_plan_generated');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeDefined();
      expect(output.reasoning).toContain('sustainable fashion');
      expect(output.data.blogPost).toBeDefined();
      expect(output.data.keywordResearch).toBeDefined();
      expect(output.data.shopifyPayload).toBeDefined();
      expect(output.data.seoScore).toBeDefined();
      expect(output.timestamp).toBeDefined();

      callAISpy.mockRestore();
    });

    it('throws ValidationError when topic is missing', async () => {
      const input = makeInput({ topic: undefined });

      await expect(agent.process(input)).rejects.toThrow('Missing required parameter: topic');
    });

    it('throws ValidationError when countryId is missing', async () => {
      const input = makeInput({ countryId: undefined });

      await expect(agent.process(input)).rejects.toThrow('Missing required parameter: countryId');
    });

    it('flags uncertainty when country data is not found', async () => {
      const callAISpy = jest
        .spyOn(ContentBlogAgent.prototype as any, 'callAI')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_KEYWORD_RESEARCH))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BLOG_RESPONSE))
        .mockResolvedValueOnce(JSON.stringify([])); // no internal links

      // All cache misses, country not found in DB
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // country not found
      mockQuery.mockResolvedValueOnce({ rows: [] }); // country not found (keyword research)
      mockQuery.mockResolvedValueOnce({ rows: [] }); // country not found (blog gen)
      mockQuery.mockResolvedValueOnce({ rows: [] }); // existing content
      mockQuery.mockResolvedValueOnce({ rows: [] }); // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] }); // logDecision

      const input = makeInput({ countryId: 'nonexistent-country' });
      const output = await agent.process(input);

      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.uncertainties[0]).toContain('country_data');

      callAISpy.mockRestore();
    });
  });
});

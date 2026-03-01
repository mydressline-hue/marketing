/**
 * Unit tests for OrganicSocialAgent (Agent 4).
 *
 * Database pool, Redis cache, and AI client are fully mocked so tests
 * exercise only the agent's domain logic: scheduling, engagement
 * optimisation, hashtag strategy, tone adaptation, and confidence scoring.
 */

// ---------------------------------------------------------------------------
// Mocks — declared before any imports
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
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-001'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock the ConfidenceScoring utility imported by BaseAgent
jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: jest.fn((score: number) => {
    if (score >= 85) return 'very_high';
    if (score >= 65) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { OrganicSocialAgent } from '../../../src/agents/modules/OrganicSocialAgent';
import type {
  SocialPost,
  EngagementPattern,
  HashtagStrategy,
  PostSchedule,
  ContentCalendar,
  PostPerformance,
} from '../../../src/agents/modules/OrganicSocialAgent';
import type { AgentInput } from '../../../src/agents/base/types';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COUNTRY_ROW = {
  id: 'country-de-001',
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'de',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  internet_penetration: 93,
  social_platforms: { instagram: 0.45, tiktok: 0.3, facebook: 0.5 },
  cultural_behavior: { formality: 'high', humor_style: 'dry', directness: 'high' },
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const SOCIAL_POST_ROW = {
  id: 'post-001',
  content: 'Check out our latest collection! #fashion #style',
  platform: 'instagram',
  country_id: 'country-de-001',
  scheduled_at: '2025-07-15T10:00:00Z',
  hashtags: ['fashion', 'style'],
  media_type: 'image',
  status: 'published',
  likes: 150,
  comments: 22,
  shares: 8,
  reach: 5000,
};

const SOCIAL_POST_ROW_2 = {
  id: 'post-002',
  content: 'Behind the scenes of our new campaign',
  platform: 'instagram',
  country_id: 'country-de-001',
  scheduled_at: '2025-07-16T14:00:00Z',
  hashtags: ['behindthescenes', 'campaign'],
  media_type: 'reel',
  status: 'published',
  likes: 320,
  comments: 45,
  shares: 30,
  reach: 12000,
};

function buildInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    requestId: 'req-test-001',
    context: {
      period: { startDate: '2025-08-01', endDate: '2025-08-31' },
      ...overrides.context,
    },
    parameters: {
      countryId: 'country-de-001',
      platform: 'instagram',
      topic: 'fashion',
      ...overrides.parameters,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: set up standard mock responses for a full process() flow
// ---------------------------------------------------------------------------

function setupFullProcessMocks() {
  // Mock callAI so it doesn't actually call the Anthropic module
  const agent = new OrganicSocialAgent();

  const inferredPattern = JSON.stringify({
    bestDays: ['Monday', 'Wednesday', 'Friday'],
    bestHours: [9, 12, 18],
    topContentTypes: ['reel', 'carousel', 'image'],
    averageEngagementRate: 0,
  });

  // Replace callAI with a controlled mock.
  // analyzeEngagementPatterns is called multiple times (cache returns null each time),
  // so we need to provide inferEngagementPatterns responses for each invocation.
  (agent as any).callAI = jest.fn()
    .mockResolvedValueOnce(inferredPattern)   // 1st inferEngagementPatterns (from process -> analyzeEngagementPatterns)
    .mockResolvedValueOnce(inferredPattern)   // 2nd inferEngagementPatterns (from getOptimalPostingTimes -> analyzeEngagementPatterns)
    .mockResolvedValueOnce(inferredPattern)   // 3rd inferEngagementPatterns (from generatePostSchedule -> analyzeEngagementPatterns)
    .mockResolvedValueOnce(                   // generatePostSchedule -> callAI for schedule generation
      JSON.stringify([
        {
          content: 'Summer fashion highlights',
          scheduledAt: '2025-08-01T09:00:00Z',
          platform: 'instagram',
          hashtags: ['summer', 'fashion'],
          mediaType: 'reel',
          targetAudience: '18-34 women',
        },
      ]),
    )
    .mockResolvedValueOnce(  // generateToneGuidance
      'Use a direct, professional tone. Germans value precision and authenticity over hype.',
    )
    .mockResolvedValueOnce(  // generateHashtagStrategy
      JSON.stringify({
        primary: ['#fashion', '#style'],
        secondary: ['#ootd', '#inspo'],
        trending: ['#summerstyle'],
        countrySpecific: ['#mode', '#stil'],
      }),
    );

  return agent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrganicSocialAgent', () => {
  let agent: OrganicSocialAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new OrganicSocialAgent();
  });

  // -----------------------------------------------------------------------
  // Construction and configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an agent with correct type and model', () => {
      expect(agent.getAgentType()).toBe('organic_social');
      expect(agent.getConfig().model).toBe('sonnet');
      expect(agent.getConfig().agentType).toBe('organic_social');
    });

    it('accepts custom configuration overrides', () => {
      const custom = new OrganicSocialAgent({
        maxRetries: 5,
        timeoutMs: 120_000,
        confidenceThreshold: 80,
      });

      const config = custom.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(120_000);
      expect(config.confidenceThreshold).toBe(80);
      // agentType must always be organic_social regardless of override
      expect(config.agentType).toBe('organic_social');
    });
  });

  // -----------------------------------------------------------------------
  // getChallengeTargets
  // -----------------------------------------------------------------------

  describe('getChallengeTargets', () => {
    it('returns the expected set of challenge target agent types', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['content_blog', 'creative_generation', 'brand_consistency']);
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a non-empty prompt covering social strategy topics', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(50);
      expect(prompt).toContain('organic social media');
      expect(prompt).toContain('hashtag');
      expect(prompt).toContain('cultural');
    });
  });

  // -----------------------------------------------------------------------
  // process — missing parameters
  // -----------------------------------------------------------------------

  describe('process — input validation', () => {
    it('returns failure output when countryId is missing', async () => {
      const input = buildInput();
      delete (input.parameters as Record<string, unknown>).countryId;

      // Stub out persistState and logDecision to avoid DB calls
      (agent as any).persistState = jest.fn().mockResolvedValue(undefined);
      (agent as any).logDecision = jest.fn().mockResolvedValue(undefined);

      const output = await agent.process(input);

      expect(output.decision).toBe('organic_social_plan_failed');
      expect(output.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('countryId')]),
      );
      expect(output.confidence.score).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // process — full pipeline with no historical data
  // -----------------------------------------------------------------------

  describe('process — full pipeline (no historical data)', () => {
    it('generates a social plan and flags uncertainty on missing data', async () => {
      const agentFull = setupFullProcessMocks();

      // Mock DB: trace the actual call order through process()
      // 1. loadScheduledPosts
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 2. analyzeEngagementPatterns -> queryEngagementData count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // 3. inferEngagementPatterns -> loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 4. getOptimalPostingTimes -> analyzeEngagementPatterns -> queryEngagementData count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // 5. 2nd inferEngagementPatterns -> loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 6. getOptimalPostingTimes -> loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 7. generatePostSchedule -> analyzeEngagementPatterns -> queryEngagementData count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // 8. 3rd inferEngagementPatterns -> loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 9. process -> loadCountryProfile for tone guidance
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 10. generateHashtagStrategy -> loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      // Stub persistState and logDecision to simplify
      (agentFull as any).persistState = jest.fn().mockResolvedValue(undefined);
      (agentFull as any).logDecision = jest.fn().mockResolvedValue(undefined);

      const input = buildInput();
      const output = await agentFull.process(input);

      expect(output.agentType).toBe('organic_social');
      expect(output.decision).toBe('organic_social_plan');
      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.uncertainties.some((u) => u.includes('historical_data'))).toBe(true);
      expect(output.data.countryId).toBe('country-de-001');
      expect(output.data.postSchedule).toBeDefined();
      expect(output.recommendations.length).toBeGreaterThan(0);
      expect(output.timestamp).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // process — with existing posts and engagement data
  // -----------------------------------------------------------------------

  describe('process — with historical engagement data', () => {
    it('uses DB engagement data and produces higher confidence', async () => {
      const agentWithData = new OrganicSocialAgent();

      const cachedEngagementPattern = {
        bestDays: ['Wednesday'],
        bestHours: [10, 14],
        topContentTypes: ['reel'],
        averageEngagementRate: 3.45,
      };

      (agentWithData as any).callAI = jest.fn()
        .mockResolvedValueOnce(  // generatePostSchedule -> callAI for schedule
          JSON.stringify([
            {
              content: 'New arrivals just dropped!',
              scheduledAt: '2025-08-01T09:00:00Z',
              platform: 'instagram',
              hashtags: ['newarrivals'],
              mediaType: 'carousel',
              targetAudience: '18-34',
            },
          ]),
        )
        .mockResolvedValueOnce(  // generateToneGuidance
          'Keep it professional yet approachable for the German market.',
        )
        .mockResolvedValueOnce(  // generateHashtagStrategy
          JSON.stringify({
            primary: ['#fashion'],
            secondary: ['#ootd'],
            trending: [],
            countrySpecific: ['#mode'],
          }),
        )
        .mockResolvedValueOnce(  // optimizeEngagement
          JSON.stringify([
            { postId: 'post-001', suggestion: 'Add a CTA', expectedLift: 12, confidence: 70 },
          ]),
        );

      (agentWithData as any).persistState = jest.fn().mockResolvedValue(undefined);
      (agentWithData as any).logDecision = jest.fn().mockResolvedValue(undefined);

      // Set up cacheGet sequence matching the actual call order:
      // #1: engagement_patterns -> null (miss, will query DB)
      // #2: posting_times -> null (miss)
      // #3: engagement_patterns -> HIT (second call from getOptimalPostingTimes)
      // #4: country -> null (miss, loadCountryProfile in getOptimalPostingTimes)
      // #5: engagement_patterns -> HIT (third call from generatePostSchedule)
      // #6: country -> null (miss, loadCountryProfile for tone)
      // #7: hashtags -> null (miss)
      // #8: country -> null (miss, loadCountryProfile for hashtags)
      mockCacheGet
        .mockResolvedValueOnce(null)                  // #1 engagement_patterns miss
        .mockResolvedValueOnce(null)                  // #2 posting_times miss
        .mockResolvedValueOnce(cachedEngagementPattern) // #3 engagement_patterns hit
        .mockResolvedValueOnce(null)                  // #4 country miss
        .mockResolvedValueOnce(cachedEngagementPattern) // #5 engagement_patterns hit
        .mockResolvedValueOnce(null)                  // #6 country miss (tone)
        .mockResolvedValueOnce(null)                  // #7 hashtags miss
        .mockResolvedValueOnce(null);                 // #8 country miss (hashtags)

      // DB query sequence matching the actual call order:
      // 1. loadScheduledPosts
      mockQuery.mockResolvedValueOnce({ rows: [SOCIAL_POST_ROW, SOCIAL_POST_ROW_2] });
      // 2-6. analyzeEngagementPatterns -> queryEngagementData chain (5 queries)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] }); // totalPosts
      mockQuery.mockResolvedValueOnce({ rows: [{ day_name: 'Wednesday', avg_engagement: 45 }] }); // bestDays
      mockQuery.mockResolvedValueOnce({ rows: [{ hour: 10, avg_engagement: 55 }, { hour: 14, avg_engagement: 48 }] }); // bestHours
      mockQuery.mockResolvedValueOnce({ rows: [{ media_type: 'reel', avg_engagement: 60 }] }); // topContentTypes
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_rate: '3.45' }] }); // avgEngagementRate
      // 7. loadCountryProfile in getOptimalPostingTimes (cache miss #4)
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 8. loadCountryProfile for tone (cache miss #6)
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // 9. loadCountryProfile for hashtags (cache miss #8)
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const input = buildInput();
      const output = await agentWithData.process(input);

      expect(output.decision).toBe('organic_social_plan');
      // With real data, confidence should be higher
      expect(output.confidence.score).toBeGreaterThan(50);
      expect(output.confidence.factors.dataAvailability).toBe(75);
      expect(output.confidence.factors.engagementDataQuality).toBe(80);
      expect(output.data.existingPostCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // assessPostPerformance
  // -----------------------------------------------------------------------

  describe('assessPostPerformance', () => {
    it('computes engagement rate from DB metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'post-001',
          content: 'Test post',
          platform: 'instagram',
          country_id: 'country-de-001',
          scheduled_at: '2025-07-15T10:00:00Z',
          hashtags: ['test'],
          media_type: 'image',
          status: 'published',
          likes: 200,
          comments: 30,
          shares: 20,
          reach: 5000,
          sentiment: 0.75,
        }],
      });

      const perf = await agent.assessPostPerformance('post-001');

      expect(perf.likes).toBe(200);
      expect(perf.comments).toBe(30);
      expect(perf.shares).toBe(20);
      expect(perf.reach).toBe(5000);
      // (200 + 30 + 20) / 5000 * 100 = 5.0
      expect(perf.engagementRate).toBe(5);
      expect(perf.sentiment).toBe(0.75);
    });

    it('returns zero metrics when post is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const perf = await agent.assessPostPerformance('nonexistent');

      expect(perf.likes).toBe(0);
      expect(perf.comments).toBe(0);
      expect(perf.shares).toBe(0);
      expect(perf.reach).toBe(0);
      expect(perf.engagementRate).toBe(0);
      expect(perf.sentiment).toBe(0);
    });

    it('handles zero reach without division error', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'post-003',
          content: 'Zero reach post',
          platform: 'tiktok',
          country_id: 'country-de-001',
          scheduled_at: '2025-07-15T10:00:00Z',
          hashtags: [],
          media_type: 'video',
          status: 'published',
          likes: 0,
          comments: 0,
          shares: 0,
          reach: 0,
          sentiment: 0,
        }],
      });

      const perf = await agent.assessPostPerformance('post-003');

      expect(perf.engagementRate).toBe(0);
      expect(perf.reach).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // adaptTone
  // -----------------------------------------------------------------------

  describe('adaptTone', () => {
    it('adapts content using country cultural profile', async () => {
      (agent as any).callAI = jest.fn().mockResolvedValue(
        'Entdecken Sie unsere neueste Kollektion - Qualitat und Stil vereint.',
      );

      // loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const result = await agent.adaptTone(
        'Check out our latest collection! Amazing deals await!',
        'country-de-001',
      );

      expect(result).toContain('Kollektion');
      expect((agent as any).callAI).toHaveBeenCalledTimes(1);

      // Verify the AI prompt included cultural context
      const aiPrompt = (agent as any).callAI.mock.calls[0][1] as string;
      expect(aiPrompt).toContain('Germany');
      expect(aiPrompt).toContain('cultural_behavior');
    });

    it('returns original content when country profile not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const original = 'Amazing summer sale!';
      const result = await agent.adaptTone(original, 'nonexistent-country');

      expect(result).toBe(original);
    });
  });

  // -----------------------------------------------------------------------
  // generateHashtagStrategy
  // -----------------------------------------------------------------------

  describe('generateHashtagStrategy', () => {
    it('generates hashtag categories via AI', async () => {
      (agent as any).callAI = jest.fn().mockResolvedValue(
        JSON.stringify({
          primary: ['#fashion', '#style', '#ootd'],
          secondary: ['#inspo', '#lookbook', '#outfitideas', '#trendy', '#streetstyle'],
          trending: ['#summerstyle2025'],
          countrySpecific: ['#mode', '#stil', '#deutschemode'],
        }),
      );

      // loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const strategy = await agent.generateHashtagStrategy(
        'country-de-001',
        'instagram',
        'fashion',
      );

      expect(strategy.primary).toHaveLength(3);
      expect(strategy.secondary.length).toBeGreaterThanOrEqual(5);
      expect(strategy.trending).toHaveLength(1);
      expect(strategy.countrySpecific.length).toBeGreaterThanOrEqual(3);
      expect(strategy.countrySpecific).toContain('#mode');
    });

    it('returns cached strategy when available', async () => {
      const cachedStrategy: HashtagStrategy = {
        primary: ['#cached'],
        secondary: ['#fromcache'],
        trending: [],
        countrySpecific: ['#cachedlocal'],
      };
      mockCacheGet.mockResolvedValueOnce(cachedStrategy);

      (agent as any).callAI = jest.fn();

      const strategy = await agent.generateHashtagStrategy(
        'country-de-001',
        'instagram',
        'fashion',
      );

      expect(strategy).toEqual(cachedStrategy);
      expect((agent as any).callAI).not.toHaveBeenCalled();
    });

    it('returns default empty strategy when AI response is malformed', async () => {
      (agent as any).callAI = jest.fn().mockResolvedValue('this is not valid json at all');

      // loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const strategy = await agent.generateHashtagStrategy(
        'country-de-001',
        'instagram',
        'fashion',
      );

      expect(strategy.primary).toEqual([]);
      expect(strategy.secondary).toEqual([]);
      expect(strategy.trending).toEqual([]);
      expect(strategy.countrySpecific).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // analyzeEngagementPatterns
  // -----------------------------------------------------------------------

  describe('analyzeEngagementPatterns', () => {
    it('returns patterns from DB when historical data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '100' }] });  // totalPosts
      mockQuery.mockResolvedValueOnce({
        rows: [
          { day_name: 'Tuesday  ', avg_engagement: 120 },
          { day_name: 'Thursday ', avg_engagement: 95 },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { hour: 9, avg_engagement: 85 },
          { hour: 17, avg_engagement: 78 },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { media_type: 'reel', avg_engagement: 200 },
          { media_type: 'carousel', avg_engagement: 150 },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_rate: '4.25' }] });

      const pattern = await agent.analyzeEngagementPatterns('country-de-001');

      expect(pattern.bestDays).toEqual(['Tuesday', 'Thursday']);
      expect(pattern.bestHours).toEqual([9, 17]);
      expect(pattern.topContentTypes).toEqual(['reel', 'carousel']);
      expect(pattern.averageEngagementRate).toBe(4.25);
    });

    it('infers patterns via AI when no historical data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }); // totalPosts = 0

      // loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      (agent as any).callAI = jest.fn().mockResolvedValue(
        JSON.stringify({
          bestDays: ['Monday', 'Thursday'],
          bestHours: [8, 12, 19],
          topContentTypes: ['image', 'reel'],
          averageEngagementRate: 2.0,
        }),
      );

      const pattern = await agent.analyzeEngagementPatterns('country-de-001');

      expect(pattern.bestDays).toEqual(['Monday', 'Thursday']);
      expect(pattern.bestHours).toEqual([8, 12, 19]);
      expect(pattern.averageEngagementRate).toBe(2.0);
    });

    it('returns cached patterns when available', async () => {
      const cachedPattern: EngagementPattern = {
        bestDays: ['Wednesday'],
        bestHours: [10],
        topContentTypes: ['video'],
        averageEngagementRate: 5.5,
      };
      mockCacheGet.mockResolvedValueOnce(cachedPattern);

      const pattern = await agent.analyzeEngagementPatterns('country-de-001');

      expect(pattern).toEqual(cachedPattern);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getOptimalPostingTimes
  // -----------------------------------------------------------------------

  describe('getOptimalPostingTimes', () => {
    it('derives times from engagement patterns and timezone', async () => {
      // analyzeEngagementPatterns -> queryEngagementData
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ day_name: 'Monday', avg_engagement: 100 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ hour: 9, avg_engagement: 80 }, { hour: 18, avg_engagement: 70 }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ media_type: 'image', avg_engagement: 90 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_rate: '3.0' }] });

      // loadCountryProfile
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const times = await agent.getOptimalPostingTimes('country-de-001', 'instagram');

      expect(times.length).toBeGreaterThan(0);
      expect(times[0]).toContain('Europe/Berlin');
      expect(times[0]).toMatch(/^\d{2}:00/);
    });

    it('returns cached times when available', async () => {
      mockCacheGet.mockResolvedValueOnce(['10:00 Europe/Berlin', '15:00 Europe/Berlin']);

      const times = await agent.getOptimalPostingTimes('country-de-001', 'instagram');

      expect(times).toEqual(['10:00 Europe/Berlin', '15:00 Europe/Berlin']);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Confidence scoring
  // -----------------------------------------------------------------------

  describe('confidence scoring', () => {
    it('produces low confidence when all factors are weak', async () => {
      const input = buildInput();

      // All callAI calls return a generic pattern with empty/zero values
      (agent as any).callAI = jest.fn()
        .mockResolvedValue(JSON.stringify({
          bestDays: [],
          bestHours: [],
          topContentTypes: [],
          averageEngagementRate: 0,
        }));

      (agent as any).persistState = jest.fn().mockResolvedValue(undefined);
      (agent as any).logDecision = jest.fn().mockResolvedValue(undefined);

      // All DB queries will use the default mockResolvedValue({ rows: [] })
      // which returns empty rows. This means:
      // - loadScheduledPosts returns empty (no posts)
      // - queryEngagementData count returns 0 (triggers AI inference)
      // - loadCountryProfile returns null (no country profile)
      // All the above produce the "low confidence" scenario.

      const output = await agent.process(input);

      // With no data sources, confidence should be low
      expect(output.confidence.level).toBe('low');
      expect(output.confidence.score).toBeLessThan(40);
    });
  });

  // -----------------------------------------------------------------------
  // optimizeEngagement
  // -----------------------------------------------------------------------

  describe('optimizeEngagement', () => {
    it('returns empty array for empty post list', async () => {
      const recs = await agent.optimizeEngagement([]);
      expect(recs).toEqual([]);
    });

    it('filters out recommendations for non-existent post IDs', async () => {
      const posts: SocialPost[] = [{
        id: 'post-001',
        content: 'Test post content',
        platform: 'instagram',
        countryId: 'country-de-001',
        scheduledAt: '2025-07-15T10:00:00Z',
        hashtags: ['test'],
        mediaType: 'image',
        status: 'published',
        engagement: { likes: 50, comments: 5, shares: 2, reach: 1000 },
      }];

      (agent as any).callAI = jest.fn().mockResolvedValue(
        JSON.stringify([
          { postId: 'post-001', suggestion: 'Add a CTA', expectedLift: 15, confidence: 80 },
          { postId: 'fake-post', suggestion: 'This should be filtered', expectedLift: 5, confidence: 30 },
        ]),
      );

      const recs = await agent.optimizeEngagement(posts);

      expect(recs).toHaveLength(1);
      expect(recs[0].postId).toBe('post-001');
      expect(recs[0].suggestion).toBe('Add a CTA');
      expect(recs[0].expectedLift).toBe(15);
      expect(recs[0].confidence).toBe(80);
    });
  });
});

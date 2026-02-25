/**
 * Unit tests for CreativeGenerationAgent (Agent 6).
 *
 * All external dependencies (database, Redis, AI client, logger) are mocked
 * so tests exercise only the agent's domain logic: ad copy generation, video
 * scripts, UGC scripts, brand tone validation, fatigue scoring, rotation
 * suggestions, variations, and performance assessment.
 */

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports
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
    LOG_LEVEL: 'silent',
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid'),
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { CreativeGenerationAgent } from '../../../src/agents/modules/CreativeGenerationAgent';
import type {
  GeneratedAdCopy,
  VideoScript,
  UGCScript,
  BrandGuidelines,
  BrandToneValidation,
} from '../../../src/agents/modules/CreativeGenerationAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import type { AgentInput } from '../../../src/agents/base/types';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAMPAIGN_ROW = {
  id: 'campaign-1',
  name: 'Summer Launch DE',
  type: 'conversion',
  budget: 10000,
  targeting: { age: '18-35' },
  country_name: 'Germany',
  language: 'de',
  cultural_behavior: { formality: 'high' },
};

const COUNTRY_ROW = {
  name: 'Germany',
  language: 'de',
  cultural_behavior: { formality: 'high' },
  social_platforms: { meta: 0.6, tiktok: 0.3 },
};

const CREATIVE_ROW = {
  id: 'creative-1',
  name: 'Summer Ad V1',
  type: 'ad_copy',
  campaign_id: 'campaign-1',
  fatigue_score: 0.3,
  is_active: true,
  created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
  updated_at: new Date().toISOString(),
  performance: JSON.stringify({
    impressions: 50000,
    clicks: 1500,
    conversions: 75,
    ctr: 3.0,
    engagement_rate: 3.5,
  }),
};

const FATIGUED_CREATIVE_ROW = {
  id: 'creative-fatigued',
  name: 'Old Ad',
  type: 'ad_copy',
  campaign_id: 'campaign-1',
  fatigue_score: 0.85,
  is_active: true,
  created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
  updated_at: new Date().toISOString(),
  performance: JSON.stringify({
    impressions: 600000,
    clicks: 3000,
    conversions: 100,
    ctr: 0.5,
    engagement_rate: 0.8,
  }),
};

const BRAND_GUIDELINES: BrandGuidelines = {
  tone: 'professional',
  voiceAttributes: ['confident', 'warm', 'inclusive'],
  avoidWords: ['cheap', 'free', 'guaranteed'],
  colorPalette: ['#1A73E8', '#FFFFFF', '#333333'],
  typography: 'Sans-serif, modern',
};

function buildInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    context: {},
    parameters: {},
    requestId: 'req-test-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock AI call
// ---------------------------------------------------------------------------

let mockCallAI: jest.SpyInstance;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreativeGenerationAgent', () => {
  let agent: CreativeGenerationAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new CreativeGenerationAgent();

    // Mock the callAI method on the instance — returns empty JSON by default
    mockCallAI = jest
      .spyOn(agent as any, 'callAI')
      .mockResolvedValue('{}');
  });

  afterEach(() => {
    mockCallAI.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Constructor & config
  // -----------------------------------------------------------------------

  describe('configuration', () => {
    it('initialises with correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('creative_generation');
      expect(agent.getConfig().model).toBe('sonnet');
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['brand_consistency', 'organic_social', 'paid_ads']);
      expect(targets).toHaveLength(3);
    });

    it('returns a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('creative');
    });
  });

  // -----------------------------------------------------------------------
  // process() — task routing
  // -----------------------------------------------------------------------

  describe('process()', () => {
    it('returns error output when no task is specified', async () => {
      const input = buildInput();
      const output = await agent.process(input);

      expect(output.decision).toBe('creative_generation_error');
      expect(output.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('Missing required parameter')]),
      );
      expect(output.confidence.score).toBe(0);
    });

    it('returns error output for unknown task type', async () => {
      const input = buildInput({ parameters: { task: 'unknown_task' } });
      const output = await agent.process(input);

      expect(output.decision).toBe('creative_generation_error');
      expect(output.reasoning).toContain('Unknown task');
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });

    it('routes generate_ad_copy task and returns structured output', async () => {
      const adCopyResponse: GeneratedAdCopy = {
        headline: 'Transform Your Summer',
        description: 'Discover premium products crafted for the German market.',
        callToAction: 'Shop Now',
        platform: 'meta',
        variants: [
          { headline: 'Summer Essentials', description: 'Quality you can trust.', angle: 'trust' },
        ],
      };

      mockCallAI.mockResolvedValueOnce(JSON.stringify(adCopyResponse));

      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // Country query
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // logDecision insert
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input = buildInput({
        parameters: {
          task: 'generate_ad_copy',
          campaignId: 'campaign-1',
          platform: 'meta',
          countryId: 'country-de',
        },
      });

      const output = await agent.process(input);

      expect(output.decision).toBe('ad_copy_generated');
      expect(output.agentType).toBe('creative_generation');
      expect((output.data.adCopy as GeneratedAdCopy).headline).toBe('Transform Your Summer');
      expect((output.data.adCopy as GeneratedAdCopy).variants).toHaveLength(1);
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.recommendations.length).toBeGreaterThan(0);
    });

    it('handles AI call failure gracefully in process()', async () => {
      mockCallAI.mockRejectedValueOnce(new Error('AI service unavailable'));

      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // Country query
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const input = buildInput({
        parameters: {
          task: 'generate_ad_copy',
          campaignId: 'campaign-1',
          platform: 'meta',
          countryId: 'country-de',
        },
      });

      const output = await agent.process(input);

      expect(output.decision).toBe('creative_generation_error');
      expect(output.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('AI service unavailable')]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // generateAdCopy()
  // -----------------------------------------------------------------------

  describe('generateAdCopy()', () => {
    it('fetches campaign and country context from database', async () => {
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        headline: 'Test',
        description: 'Test desc',
        callToAction: 'Buy',
        platform: 'meta',
        variants: [],
      }));

      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      await agent.generateAdCopy('campaign-1', 'meta', 'country-de');

      // Verify both queries were made
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][1]).toEqual(['campaign-1']);
      expect(mockQuery.mock.calls[1][1]).toEqual(['country-de']);
    });

    it('handles missing campaign gracefully', async () => {
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        headline: 'Fallback',
        description: 'No campaign context',
        callToAction: 'Learn More',
        platform: 'google',
        variants: [],
      }));

      mockQuery.mockResolvedValueOnce({ rows: [] }); // No campaign
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const result = await agent.generateAdCopy('nonexistent', 'google', 'country-de');

      expect(result.platform).toBe('google');
      expect(result.headline).toBe('Fallback');
    });
  });

  // -----------------------------------------------------------------------
  // generateVideoScript()
  // -----------------------------------------------------------------------

  describe('generateVideoScript()', () => {
    it('generates a structured video script with scenes', async () => {
      const videoResponse: VideoScript = {
        title: 'Brand Story',
        scenes: [
          { number: 1, visual: 'Wide shot of city', audio: 'Ambient music', duration: 5, text: 'Welcome' },
          { number: 2, visual: 'Product close-up', audio: 'Voiceover begins', duration: 10 },
        ],
        duration: 30,
        voiceover: 'Our journey started with a simple idea...',
        callToAction: 'Visit our site',
      };

      mockCallAI.mockResolvedValueOnce(JSON.stringify(videoResponse));
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const result = await agent.generateVideoScript('Brand Launch', 'tiktok', 30, 'country-de');

      expect(result.title).toBe('Brand Story');
      expect(result.scenes).toHaveLength(2);
      expect(result.scenes[0].number).toBe(1);
      expect(result.duration).toBe(30);
      expect(result.voiceover).toContain('journey');
    });
  });

  // -----------------------------------------------------------------------
  // generateUGCScript()
  // -----------------------------------------------------------------------

  describe('generateUGCScript()', () => {
    it('generates a UGC script with talking points', async () => {
      const ugcResponse: UGCScript = {
        hook: 'You will NOT believe this product...',
        body: 'I have been using it for two weeks and the results speak for themselves.',
        callToAction: 'Link in bio!',
        talkingPoints: ['Ease of use', 'Value for money', 'Before and after results'],
        tone: 'casual',
      };

      mockCallAI.mockResolvedValueOnce(JSON.stringify(ugcResponse));
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const result = await agent.generateUGCScript('Skincare Serum', 'tiktok', 'country-de');

      expect(result.hook).toContain('NOT believe');
      expect(result.talkingPoints).toHaveLength(3);
      expect(result.tone).toBe('casual');
    });
  });

  // -----------------------------------------------------------------------
  // validateBrandTone()
  // -----------------------------------------------------------------------

  describe('validateBrandTone()', () => {
    it('returns invalid result when content is empty', async () => {
      const result = await agent.validateBrandTone('', BRAND_GUIDELINES);

      expect(result.consistent).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('missing_input');
    });

    it('returns invalid result when guidelines are missing', async () => {
      const result = await agent.validateBrandTone('Some content', null as any);

      expect(result.consistent).toBe(false);
      expect(result.score).toBe(0);
    });

    it('validates content against brand guidelines using AI', async () => {
      const validationResponse: BrandToneValidation = {
        consistent: true,
        score: 87,
        issues: [],
        suggestions: ['Consider adding a warmer closing line'],
      };

      mockCallAI.mockResolvedValueOnce(JSON.stringify(validationResponse));

      const result = await agent.validateBrandTone(
        'Experience our premium collection, designed with you in mind.',
        BRAND_GUIDELINES,
      );

      expect(result.consistent).toBe(true);
      expect(result.score).toBe(87);
      expect(result.issues).toHaveLength(0);
      expect(result.suggestions).toHaveLength(1);
    });

    it('clamps validation score to 0-100 range', async () => {
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        consistent: true,
        score: 150,
        issues: [],
        suggestions: [],
      }));

      const result = await agent.validateBrandTone('Content', BRAND_GUIDELINES);

      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  // -----------------------------------------------------------------------
  // calculateFatigueScore()
  // -----------------------------------------------------------------------

  describe('calculateFatigueScore()', () => {
    it('returns cached fatigue score when available', async () => {
      const cachedScore = {
        score: 0.45,
        factors: { impressions_volume: 0.3, ctr_decay: 0.5 },
        recommendation: 'Plan replacement.',
      };
      mockCacheGet.mockResolvedValueOnce(cachedScore);

      const result = await agent.calculateFatigueScore('creative-1');

      expect(result).toEqual(cachedScore);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns zero score for non-existent creative', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.calculateFatigueScore('nonexistent');

      expect(result.score).toBe(0);
      expect(result.recommendation).toContain('not found');
    });

    it('calculates fatigue from performance metrics for healthy creative', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CREATIVE_ROW] });

      const result = await agent.calculateFatigueScore('creative-1');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThan(0.7);
      expect(result.factors).toHaveProperty('impressions_volume');
      expect(result.factors).toHaveProperty('ctr_decay');
      expect(result.factors).toHaveProperty('engagement_decline');
      expect(result.factors).toHaveProperty('time_in_rotation');
      expect(result.recommendation).toContain('performing well');

      // Verify caching
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('creative:fatigue:creative-1'),
        expect.objectContaining({ score: expect.any(Number) }),
        expect.any(Number),
      );
    });

    it('detects high fatigue for an old, underperforming creative', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [FATIGUED_CREATIVE_ROW] });

      const result = await agent.calculateFatigueScore('creative-fatigued');

      expect(result.score).toBeGreaterThanOrEqual(0.7);
      expect(result.recommendation).toContain('rotation');
    });
  });

  // -----------------------------------------------------------------------
  // suggestCreativeRotation()
  // -----------------------------------------------------------------------

  describe('suggestCreativeRotation()', () => {
    it('returns default recommendation when no creatives exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.suggestCreativeRotation('campaign-1');

      expect(result.retire).toHaveLength(0);
      expect(result.keep).toHaveLength(0);
      expect(result.newCreativesNeeded).toBe(3);
      expect(result.reasoning).toContain('No active creatives');
    });

    it('categorises creatives into retire/keep based on fatigue', async () => {
      // First query: list creatives
      mockQuery.mockResolvedValueOnce({
        rows: [
          { ...CREATIVE_ROW, id: 'creative-healthy' },
          { ...FATIGUED_CREATIVE_ROW, id: 'creative-tired' },
        ],
      });
      // calculateFatigueScore queries for each creative
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CREATIVE_ROW, id: 'creative-healthy' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ ...FATIGUED_CREATIVE_ROW, id: 'creative-tired' }] });

      const result = await agent.suggestCreativeRotation('campaign-1');

      expect(result.keep).toContain('creative-healthy');
      expect(result.retire).toContain('creative-tired');
      expect(result.newCreativesNeeded).toBeGreaterThanOrEqual(2);
      expect(result.reasoning).toContain('Analyzed');
    });
  });

  // -----------------------------------------------------------------------
  // generateVariations()
  // -----------------------------------------------------------------------

  describe('generateVariations()', () => {
    it('generates the requested number of variations', async () => {
      const variations = [
        'Discover your perfect summer look today',
        'Summer essentials, handpicked for you',
        'Your best summer starts here',
      ];

      mockCallAI.mockResolvedValueOnce(JSON.stringify(variations));

      const result = await agent.generateVariations('Summer collection now available', 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toContain('summer');
    });

    it('caps count at 10 variations maximum', async () => {
      mockCallAI.mockResolvedValueOnce(JSON.stringify(['V1', 'V2']));

      await agent.generateVariations('Base text', 50);

      // Verify the prompt sent to AI requests at most 10
      const promptArg = mockCallAI.mock.calls[0][1];
      const parsed = JSON.parse(promptArg);
      expect(parsed.count).toBeLessThanOrEqual(10);
    });

    it('returns empty array when AI response cannot be parsed', async () => {
      mockCallAI.mockResolvedValueOnce('not valid json at all');

      const result = await agent.generateVariations('Base text', 3);

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // assessCreativePerformance()
  // -----------------------------------------------------------------------

  describe('assessCreativePerformance()', () => {
    it('returns computed performance metrics from database', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'creative-1',
          performance: JSON.stringify({
            impressions: 100000,
            clicks: 5000,
            conversions: 250,
          }),
        }],
      });

      const result = await agent.assessCreativePerformance('creative-1');

      expect(result.impressions).toBe(100000);
      expect(result.clicks).toBe(5000);
      expect(result.conversions).toBe(250);
      // CTR = (5000 / 100000) * 100 = 5.0
      expect(result.ctr).toBe(5);
      // engagement_rate = ((5000 + 250) / 100000) * 100 = 5.25
      expect(result.engagement_rate).toBe(5.25);
    });

    it('returns cached performance when available', async () => {
      const cachedPerf = {
        impressions: 50000,
        clicks: 2000,
        conversions: 100,
        ctr: 4.0,
        engagement_rate: 4.2,
      };
      mockCacheGet.mockResolvedValueOnce(cachedPerf);

      const result = await agent.assessCreativePerformance('creative-1');

      expect(result).toEqual(cachedPerf);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns zero metrics for non-existent creative', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.assessCreativePerformance('nonexistent');

      expect(result.impressions).toBe(0);
      expect(result.ctr).toBe(0);
      expect(result.engagement_rate).toBe(0);
    });

    it('handles zero impressions without division errors', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'creative-empty',
          performance: JSON.stringify({
            impressions: 0,
            clicks: 0,
            conversions: 0,
          }),
        }],
      });

      const result = await agent.assessCreativePerformance('creative-empty');

      expect(result.ctr).toBe(0);
      expect(result.engagement_rate).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // AI response parsing
  // -----------------------------------------------------------------------

  describe('parseAIResponse (via generateAdCopy)', () => {
    it('handles markdown-fenced JSON responses', async () => {
      const fencedResponse = '```json\n{"headline":"Fenced","description":"Test","callToAction":"Go","platform":"meta","variants":[]}\n```';

      mockCallAI.mockResolvedValueOnce(fencedResponse);
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const result = await agent.generateAdCopy('campaign-1', 'meta', 'country-de');

      expect(result.headline).toBe('Fenced');
    });

    it('returns empty structure when AI returns unparseable response', async () => {
      mockCallAI.mockResolvedValueOnce('This is not JSON at all');

      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const result = await agent.generateAdCopy('campaign-1', 'meta', 'country-de');

      expect(result.headline).toBe('');
      expect(result.variants).toEqual([]);
      expect(result.platform).toBe('meta');
    });
  });
});

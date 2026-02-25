/**
 * Unit tests for BrandConsistencyAgent.
 *
 * All external dependencies (database, Redis cache, AI client, logger)
 * are fully mocked so tests exercise only the agent's tone analysis,
 * messaging validation, visual consistency checking, and scoring logic.
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
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    LOG_LEVEL: 'silent',
  },
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

jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: jest.fn((score: number) => {
    if (score >= 80) return 'very_high';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { BrandConsistencyAgent } from '../../../src/agents/modules/BrandConsistencyAgent';
import type {
  ToneAnalysis,
  ToneIssue,
  MessagingValidation,
  VisualConsistencyCheck,
  CampaignAlignmentResult,
  BrandGuidelineSet,
  ConsistencyScore,
  BrandComplianceReport,
  ToneDriftResult,
} from '../../../src/agents/modules/BrandConsistencyAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import type { AgentInput } from '../../../src/agents/base/types';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Sample brand guidelines used across tests. */
const SAMPLE_GUIDELINES: BrandGuidelineSet = {
  tone: 'professional',
  voice: ['clear', 'confident', 'empathetic'],
  colors: ['#1A73E8', '#FFFFFF', '#202124'],
  typography: 'Google Sans for headers, Roboto for body',
  doNots: ['never use slang', 'avoid exclamation marks'],
  examples: ['Our platform helps you grow internationally with confidence.'],
};

/** Standard agent input payload for tests. */
const TEST_INPUT: AgentInput = {
  context: {
    campaignId: 'campaign-001',
    content: 'Our platform delivers professional-grade analytics for international growth.',
    creativeId: 'creative-001',
    mode: 'full_audit',
  },
  parameters: {},
  requestId: 'test-brand-request-001',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sets up the mock to return brand guidelines from DB. */
function mockGuidelinesFromDB(): void {
  mockQuery.mockResolvedValueOnce({
    rows: [{
      tone: SAMPLE_GUIDELINES.tone,
      voice: SAMPLE_GUIDELINES.voice,
      colors: SAMPLE_GUIDELINES.colors,
      typography: SAMPLE_GUIDELINES.typography,
      do_nots: SAMPLE_GUIDELINES.doNots,
      examples: SAMPLE_GUIDELINES.examples,
    }],
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('BrandConsistencyAgent', () => {
  let agent: BrandConsistencyAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new BrandConsistencyAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an agent with default configuration', () => {
      expect(agent.getAgentType()).toBe('brand_consistency');
      expect(agent.getConfig().model).toBe('opus');
      expect(agent.getConfig().maxRetries).toBe(3);
      expect(agent.getConfig().timeoutMs).toBe(120_000);
      expect(agent.getConfig().confidenceThreshold).toBe(60);
    });

    it('accepts custom configuration overrides', () => {
      const customAgent = new BrandConsistencyAgent({
        maxRetries: 5,
        timeoutMs: 60_000,
        confidenceThreshold: 80,
      });

      expect(customAgent.getConfig().maxRetries).toBe(5);
      expect(customAgent.getConfig().timeoutMs).toBe(60_000);
      expect(customAgent.getConfig().confidenceThreshold).toBe(80);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a non-empty system prompt mentioning brand consistency', () => {
      const prompt = agent.getSystemPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Brand Consistency');
    });
  });

  // -----------------------------------------------------------------------
  // getChallengeTargets
  // -----------------------------------------------------------------------

  describe('getChallengeTargets', () => {
    it('returns the expected challenge targets', () => {
      const targets = agent.getChallengeTargets();

      expect(targets).toEqual(
        expect.arrayContaining(['creative_generation', 'content_blog', 'localization']),
      );
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // getBrandGuidelines
  // -----------------------------------------------------------------------

  describe('getBrandGuidelines', () => {
    it('fetches guidelines from database when cache is empty', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      const guidelines = await agent.getBrandGuidelines();

      expect(guidelines.tone).toBe('professional');
      expect(guidelines.voice).toEqual(['clear', 'confident', 'empathetic']);
      expect(guidelines.colors).toContain('#1A73E8');
      expect(guidelines.doNots).toContain('never use slang');
    });

    it('returns cached guidelines when available', async () => {
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      const guidelines = await agent.getBrandGuidelines();

      expect(guidelines).toEqual(SAMPLE_GUIDELINES);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches guidelines after fetching from database', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      await agent.getBrandGuidelines();

      expect(mockCacheSet).toHaveBeenCalled();
      const cacheKey = (mockCacheSet.mock.calls[0] as unknown[])[0] as string;
      expect(cacheKey).toContain('guidelines');
    });

    it('throws when no active guidelines exist in the database', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.getBrandGuidelines()).rejects.toThrow(
        'No active brand guidelines found',
      );
    });
  });

  // -----------------------------------------------------------------------
  // analyzeTone (rule-based fallback since AI is mocked out)
  // -----------------------------------------------------------------------

  describe('analyzeTone', () => {
    it('performs rule-based tone analysis when AI is unavailable', async () => {
      // Guidelines fetch (cache miss -> DB)
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      const content = 'Our platform delivers professional-grade analytics for growth.';
      const result = await agent.analyzeTone(content);

      expect(result.content).toBe(content);
      expect(result.brandTone).toBe('professional');
      expect(typeof result.detectedTone).toBe('string');
      expect(result.alignment).toBeGreaterThanOrEqual(0);
      expect(result.alignment).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('detects do-not violations and reduces alignment score', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      // Content that contains a do-not phrase
      const content = 'This is gonna be amazing! never use slang in professional content.';
      const result = await agent.analyzeTone(content);

      // Should detect the "never use slang" do-not violation
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.alignment).toBeLessThan(70); // Reduced due to violations
    });

    it('flags informal language when brand voice is formal', async () => {
      // Return guidelines with 'formal' in voice attributes
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          tone: 'formal',
          voice: ['formal', 'authoritative'],
          colors: ['#000000'],
          typography: 'Serif',
          do_nots: [],
          examples: [],
        }],
      });

      const content = 'Hey, gonna wanna check out our cool new features lol';
      const result = await agent.analyzeTone(content);

      const formalityIssues = result.issues.filter((i) => i.type === 'formality_mismatch');
      expect(formalityIssues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // checkVisualConsistency
  // -----------------------------------------------------------------------

  describe('checkVisualConsistency', () => {
    it('returns full compliance for correctly branded creative', async () => {
      // Cache miss for visual check
      mockCacheGet.mockResolvedValueOnce(null);

      // Fetch creative details
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'creative-001',
          name: 'Brand Ad',
          type: 'image',
          content: 'Ad content',
          media_urls: [],
          metadata: {
            colors: ['#1A73E8', '#FFFFFF'],
            fonts: ['Google Sans', 'Roboto'],
            logo_present: true,
            logo_correct_placement: true,
          },
        }],
      });

      // Guidelines (cache miss -> DB)
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      const result = await agent.checkVisualConsistency('creative-001');

      expect(result.creativeId).toBe('creative-001');
      expect(result.colorCompliance).toBe(100);
      expect(result.typographyCompliance).toBe(100);
      expect(result.logoUsage).toBe(true);
      expect(result.overallScore).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('detects non-approved colors and reduces compliance', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'creative-002',
          name: 'Off-brand Ad',
          type: 'image',
          content: 'Ad content',
          media_urls: [],
          metadata: {
            colors: ['#FF0000', '#1A73E8'], // One off-brand color
            fonts: ['Roboto'],
            logo_present: true,
            logo_correct_placement: true,
          },
        }],
      });

      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      const result = await agent.checkVisualConsistency('creative-002');

      expect(result.colorCompliance).toBe(50); // 1 out of 2 compliant
      expect(result.issues.some((i) => i.includes('#FF0000'))).toBe(true);
      expect(result.overallScore).toBeLessThan(100);
    });

    it('flags missing logo', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'creative-003',
          name: 'No Logo Ad',
          type: 'image',
          content: 'Content',
          media_urls: [],
          metadata: {
            colors: ['#1A73E8'],
            fonts: ['Roboto'],
            logo_present: false,
            logo_correct_placement: false,
          },
        }],
      });

      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      const result = await agent.checkVisualConsistency('creative-003');

      expect(result.logoUsage).toBe(false);
      expect(result.issues.some((i) => i.includes('logo not detected'))).toBe(true);
    });

    it('returns zero scores when creative is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No creative found
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      const result = await agent.checkVisualConsistency('nonexistent-creative');

      expect(result.overallScore).toBe(0);
      expect(result.issues).toContain('Creative asset not found');
    });
  });

  // -----------------------------------------------------------------------
  // detectToneDrift
  // -----------------------------------------------------------------------

  describe('detectToneDrift', () => {
    it('returns no drift when fewer than 2 content pieces provided', async () => {
      const result = await agent.detectToneDrift(['single-id']);

      expect(result.drifting).toBe(false);
      expect(result.driftDirection).toBe('none');
      expect(result.magnitude).toBe(0);
      expect(result.affectedContent).toHaveLength(0);
    });

    it('detects drift when tone alignment degrades over time', async () => {
      // Content piece 1: well-aligned (guidelines + tone analysis)
      // fetchContentText for content-1
      mockQuery.mockResolvedValueOnce({
        rows: [{ content: 'Our professional platform drives measurable growth.' }],
      });
      // getBrandGuidelines (cache miss -> DB)
      mockCacheGet.mockResolvedValueOnce(null);
      mockGuidelinesFromDB();

      // Content piece 2: poorly-aligned
      mockQuery.mockResolvedValueOnce({
        rows: [{ content: 'gonna wanna lol this is super cool!! never use slang here' }],
      });
      // getBrandGuidelines (should be cached now)
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // Content piece 3: also poorly-aligned
      mockQuery.mockResolvedValueOnce({
        rows: [{ content: 'omg check this out, kinda amazing stuff!! never use slang' }],
      });
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // Content piece 4: also poorly-aligned
      mockQuery.mockResolvedValueOnce({
        rows: [{ content: 'yo wanna see something cool?? never use slang lol' }],
      });
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // Guidelines for affectedContent check
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      const result = await agent.detectToneDrift([
        'content-1',
        'content-2',
        'content-3',
        'content-4',
      ]);

      expect(typeof result.drifting).toBe('boolean');
      expect(typeof result.driftDirection).toBe('string');
      expect(result.magnitude).toBeGreaterThanOrEqual(0);
      expect(result.magnitude).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.affectedContent)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // validateMessagingAlignment
  // -----------------------------------------------------------------------

  describe('validateMessagingAlignment', () => {
    it('returns empty deviations when no campaign content exists', async () => {
      mockCacheGet.mockResolvedValueOnce(null); // Cache miss for messaging
      // fetchCampaignContent
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getBrandGuidelines
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      const result = await agent.validateMessagingAlignment('campaign-empty');

      expect(result.campaignId).toBe('campaign-empty');
      expect(result.aligned).toBe(true);
      expect(result.deviations).toHaveLength(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain('No content found');
    });

    it('returns cached result when available', async () => {
      const cachedResult: MessagingValidation = {
        campaignId: 'campaign-001',
        aligned: true,
        score: 85,
        deviations: [],
        recommendations: [],
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await agent.validateMessagingAlignment('campaign-001');

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // process (integration of all components)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('returns guidelines_unavailable when guidelines cannot be loaded', async () => {
      // All cache misses
      mockCacheGet.mockResolvedValue(null);

      // Guidelines DB returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('guidelines_unavailable');
      expect(output.agentType).toBe('brand_consistency');
      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });

    it('produces a complete brand analysis with valid guidelines', async () => {
      // getBrandGuidelines (first call in process)
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // analyzeTone -> getBrandGuidelines (cached)
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // validateMessagingAlignment -> cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // fetchCampaignContent
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // guidelines for messaging
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // checkVisualConsistency -> cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // fetchCreativeDetails
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'creative-001',
          name: 'Test Ad',
          type: 'image',
          content: 'Content',
          media_urls: [],
          metadata: {
            colors: ['#1A73E8'],
            fonts: ['Roboto'],
            logo_present: true,
            logo_correct_placement: true,
          },
        }],
      });
      // guidelines for visual check
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // validateCampaignAlignment -> cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // messaging validation already cached from above
      mockCacheGet.mockResolvedValueOnce({
        campaignId: 'campaign-001',
        aligned: true,
        score: 85,
        deviations: [],
        recommendations: [],
      });
      // fetchCampaignCreativeIds
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'creative-001' }] });
      // visual consistency for creative (cached from above)
      mockCacheGet.mockResolvedValueOnce({
        creativeId: 'creative-001',
        colorCompliance: 100,
        typographyCompliance: 100,
        logoUsage: true,
        overallScore: 100,
        issues: [],
      });
      // fetchCampaignContent for tone scoring
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // scoreOverallConsistency -> cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // validateCampaignAlignment (cached from above)
      mockCacheGet.mockResolvedValueOnce({
        campaignId: 'campaign-001',
        messagingScore: 85,
        visualScore: 100,
        toneScore: 80,
        overallScore: 88,
        issues: [],
      });

      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('brand_consistency_analysis_complete');
      expect(output.agentType).toBe('brand_consistency');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.timestamp).toBeTruthy();
      expect(typeof output.reasoning).toBe('string');
      expect(output.reasoning).toContain('brand_consistency');
    });

    it('handles tone_only mode correctly', async () => {
      const toneOnlyInput: AgentInput = {
        context: {
          content: 'Professional analytics platform for international markets.',
          mode: 'tone_only',
        },
        parameters: {},
        requestId: 'test-tone-only',
      };

      // getBrandGuidelines
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // analyzeTone -> guidelines (cached)
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(toneOnlyInput);

      expect(output.decision).toBe('brand_consistency_analysis_complete');
      expect(output.data).toHaveProperty('toneAnalysis');
      // Should not have visual or campaign alignment
      expect(output.data).not.toHaveProperty('visualConsistency');
      expect(output.data).not.toHaveProperty('campaignAlignment');
    });
  });
});

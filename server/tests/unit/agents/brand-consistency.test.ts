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
  MessagingValidation,
  VisualConsistencyCheck,
  BrandGuidelineSet,
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

/** DB row representing brand guidelines. */
const GUIDELINES_DB_ROW = {
  tone: SAMPLE_GUIDELINES.tone,
  voice: SAMPLE_GUIDELINES.voice,
  colors: SAMPLE_GUIDELINES.colors,
  typography: SAMPLE_GUIDELINES.typography,
  do_nots: SAMPLE_GUIDELINES.doNots,
  examples: SAMPLE_GUIDELINES.examples,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('BrandConsistencyAgent', () => {
  let agent: BrandConsistencyAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: all cache lookups miss
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    // Default: all DB queries return empty result
    mockQuery.mockResolvedValue({ rows: [] });
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
      mockQuery.mockResolvedValueOnce({ rows: [GUIDELINES_DB_ROW] });

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
      // DB should not have been called (only the persistent default from beforeEach)
      const queryCalls = mockQuery.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('brand_guidelines'),
      );
      expect(queryCalls).toHaveLength(0);
    });

    it('caches guidelines after fetching from database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [GUIDELINES_DB_ROW] });

      await agent.getBrandGuidelines();

      expect(mockCacheSet).toHaveBeenCalled();
      const cacheKey = (mockCacheSet.mock.calls[0] as unknown[])[0] as string;
      expect(cacheKey).toContain('guidelines');
    });

    it('throws when no active guidelines exist in the database', async () => {
      // Default mockQuery already returns { rows: [] }

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
      // getBrandGuidelines call inside analyzeTone
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

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
      mockCacheGet.mockResolvedValueOnce(SAMPLE_GUIDELINES);

      // Content that contains a do-not phrase ("never use slang")
      const content = 'This is professional content but never use slang here.';
      const result = await agent.analyzeTone(content);

      // Should detect the "never use slang" do-not violation
      const prohibitedIssues = result.issues.filter((i) => i.type === 'prohibited_content');
      expect(prohibitedIssues.length).toBeGreaterThan(0);
      expect(result.alignment).toBeLessThan(70); // Reduced due to violations
    });

    it('flags informal language when brand voice is formal', async () => {
      // Guidelines with 'formal' voice attribute
      const formalGuidelines: BrandGuidelineSet = {
        ...SAMPLE_GUIDELINES,
        voice: ['formal', 'authoritative'],
        doNots: [],
      };
      mockCacheGet.mockResolvedValueOnce(formalGuidelines);

      const content = 'Hey, gonna wanna check out our cool new features lol';
      const result = await agent.analyzeTone(content);

      const formalityIssues = result.issues.filter((i) => i.type === 'formality_mismatch');
      expect(formalityIssues.length).toBeGreaterThan(0);
      expect(result.alignment).toBeLessThan(70);
    });
  });

  // -----------------------------------------------------------------------
  // checkVisualConsistency
  // -----------------------------------------------------------------------

  describe('checkVisualConsistency', () => {
    it('returns full compliance for correctly branded creative', async () => {
      // Use mockImplementation for consistent key-based routing
      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null;
      });

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

      const result = await agent.checkVisualConsistency('creative-001');

      expect(result.creativeId).toBe('creative-001');
      expect(result.colorCompliance).toBe(100);
      expect(result.typographyCompliance).toBe(100);
      expect(result.logoUsage).toBe(true);
      expect(result.overallScore).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('detects non-approved colors and reduces compliance', async () => {
      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null;
      });

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

      const result = await agent.checkVisualConsistency('creative-002');

      expect(result.colorCompliance).toBe(50); // 1 out of 2 compliant
      expect(result.issues.some((i) => i.includes('#FF0000'))).toBe(true);
      expect(result.overallScore).toBeLessThan(100);
    });

    it('flags missing logo', async () => {
      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null;
      });

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

      const result = await agent.checkVisualConsistency('creative-003');

      expect(result.logoUsage).toBe(false);
      expect(result.issues.some((i) => i.includes('logo not detected'))).toBe(true);
    });

    it('returns zero scores when creative is not found', async () => {
      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null;
      });

      // Default mockQuery returns { rows: [] } -- creative not found

      const result = await agent.checkVisualConsistency('nonexistent-creative');

      expect(result.overallScore).toBe(0);
      expect(result.issues).toContain('Creative asset not found');
    });
  });

  // -----------------------------------------------------------------------
  // validateMessagingAlignment
  // -----------------------------------------------------------------------

  describe('validateMessagingAlignment', () => {
    it('returns empty deviations when no campaign content exists', async () => {
      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null; // Cache miss for messaging validation
      });
      // Ensure fetchCampaignContent returns empty
      mockQuery.mockImplementation(async (text: string) => {
        if (typeof text === 'string' && text.includes('FROM creatives')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await agent.validateMessagingAlignment('campaign-empty');

      expect(result.campaignId).toBe('campaign-empty');
      expect(result.aligned).toBe(true);
      expect(result.deviations).toHaveLength(0);
      expect(result.score).toBe(0);
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

      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('messaging:campaign-001')) return cachedResult;
        return null;
      });

      const result = await agent.validateMessagingAlignment('campaign-001');

      expect(result).toEqual(cachedResult);
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

    it('returns no drift when content cannot be fetched', async () => {
      // All content fetches will fail (default mockQuery returns { rows: [] })
      // So fetchContentText returns null for all IDs

      const result = await agent.detectToneDrift(['content-1', 'content-2', 'content-3']);

      // Less than 2 valid tone scores -> no drift detected
      expect(result.drifting).toBe(false);
      expect(result.driftDirection).toBe('none');
      expect(result.magnitude).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // process (integration of all components)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('returns guidelines_unavailable when guidelines cannot be loaded', async () => {
      const input: AgentInput = {
        context: { campaignId: 'campaign-001' },
        parameters: {},
        requestId: 'test-guidelines-fail',
      };

      // All cache misses (default)
      // All DB queries return empty (default) -> getBrandGuidelines throws

      const output = await agent.process(input);

      expect(output.decision).toBe('guidelines_unavailable');
      expect(output.agentType).toBe('brand_consistency');
      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });

    it('produces a complete brand analysis with valid guidelines', async () => {
      const input: AgentInput = {
        context: {
          campaignId: 'campaign-001',
          content: 'Professional analytics platform for international markets.',
          creativeId: 'creative-001',
          mode: 'full_audit',
        },
        parameters: {},
        requestId: 'test-full-audit',
      };

      // Use mockImplementation for cacheGet to handle multiple different keys
      const cacheStore: Record<string, unknown> = {};
      mockCacheGet.mockImplementation(async (key: string) => {
        // Always return guidelines from cache
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        // Return cached messaging validation after first computation
        if (key.includes('messaging:campaign-001') && cacheStore['messaging']) {
          return cacheStore['messaging'];
        }
        // Return cached visual consistency after first computation
        if (key.includes('visual:creative-001') && cacheStore['visual']) {
          return cacheStore['visual'];
        }
        // Return cached campaign alignment after first computation
        if (key.includes('campaign_alignment:campaign-001') && cacheStore['alignment']) {
          return cacheStore['alignment'];
        }
        // Return cached consistency score after first computation
        if (key.includes('consistency_score:campaign-001') && cacheStore['consistency']) {
          return cacheStore['consistency'];
        }
        return null;
      });

      // Track cacheSet to populate store
      mockCacheSet.mockImplementation(async (key: string, value: unknown) => {
        if (key.includes('messaging:')) cacheStore['messaging'] = value;
        if (key.includes('visual:')) cacheStore['visual'] = value;
        if (key.includes('campaign_alignment:')) cacheStore['alignment'] = value;
        if (key.includes('consistency_score:')) cacheStore['consistency'] = value;
      });

      // DB queries: fetchCampaignContent returns empty (no creatives for messaging)
      // fetchCreativeDetails returns a branded creative
      // fetchCampaignCreativeIds returns one creative
      mockQuery.mockImplementation(async (text: string) => {
        if (typeof text === 'string') {
          if (text.includes('FROM creatives') && text.includes('campaign_id')) {
            if (text.includes('SELECT id FROM')) {
              return { rows: [{ id: 'creative-001' }] };
            }
            return { rows: [] }; // No content
          }
          if (text.includes('FROM creatives') && text.includes('WHERE id')) {
            return {
              rows: [{
                id: 'creative-001',
                name: 'Test Ad',
                type: 'image',
                content: 'Professional content',
                media_urls: [],
                metadata: {
                  colors: ['#1A73E8'],
                  fonts: ['Roboto'],
                  logo_present: true,
                  logo_correct_placement: true,
                },
              }],
            };
          }
          if (text.includes('agent_states')) {
            return { rows: [] };
          }
          if (text.includes('agent_decisions')) {
            return { rows: [] };
          }
        }
        return { rows: [] };
      });

      const output = await agent.process(input);

      expect(output.decision).toBe('brand_consistency_analysis_complete');
      expect(output.agentType).toBe('brand_consistency');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.timestamp).toBeTruthy();
      expect(typeof output.reasoning).toBe('string');
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

      // Guidelines available from cache
      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null;
      });

      const output = await agent.process(toneOnlyInput);

      expect(output.decision).toBe('brand_consistency_analysis_complete');
      expect(output.data).toHaveProperty('toneAnalysis');
      // Should not have visual or campaign alignment since mode is tone_only
      expect(output.data).not.toHaveProperty('visualConsistency');
      expect(output.data).not.toHaveProperty('campaignAlignment');
    });

    it('includes confidence score with proper factors', async () => {
      const input: AgentInput = {
        context: {
          content: 'Professional brand-aligned content.',
          mode: 'tone_only',
        },
        parameters: {},
        requestId: 'test-confidence',
      };

      mockCacheGet.mockImplementation(async (key: string) => {
        if (key.includes('guidelines')) return SAMPLE_GUIDELINES;
        return null;
      });

      const output = await agent.process(input);

      expect(output.confidence).toBeDefined();
      expect(typeof output.confidence.score).toBe('number');
      expect(output.confidence.score).toBeGreaterThanOrEqual(0);
      expect(output.confidence.score).toBeLessThanOrEqual(100);
      expect(output.confidence.level).toBeDefined();
      expect(output.confidence.factors).toBeDefined();
    });
  });
});

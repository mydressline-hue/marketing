// ============================================================
// Country Strategy Agent - Unit Tests
// Tests for Agent 2: brand positioning, cultural tone, price
// sensitivity, platform mix, messaging style, and validation.
// ============================================================

import type { Country, Platform } from '../../../src/types';
import type { AgentInput, AgentOutput } from '../../../src/agents/base/types';

// ------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ------------------------------------------------------------------

// Mock the database pool
const mockQuery = jest.fn();
jest.mock('../../../src/config/database', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Mock Redis cache
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/config/redis', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock generateId to return deterministic values
jest.mock('../../../src/utils/helpers', () => ({
  ...jest.requireActual('../../../src/utils/helpers'),
  generateId: () => 'test-uuid-1234',
}));

// Mock the ConfidenceScoring module
jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: (score: number) => {
    if (score >= 85) return 'very_high';
    if (score >= 65) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  },
}));

// ------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ------------------------------------------------------------------

import {
  CountryStrategyAgent,
  type StrategyBlueprint,
  type CulturalToneProfile,
  type PriceSensitivityLevel,
  type PlatformMixRecommendation,
  type BrandPositioning,
  type MessagingStyle,
  type StrategyTimeline,
} from '../../../src/agents/modules/CountryStrategyAgent';

// ------------------------------------------------------------------
// Test helpers
// ------------------------------------------------------------------

/**
 * Builds a mock Country object with configurable overrides.
 */
function buildMockCountry(overrides: Partial<Country> = {}): Country {
  return {
    id: 'country-1',
    name: 'Japan',
    code: 'JP',
    region: 'East Asia',
    language: 'ja',
    currency: 'JPY',
    timezone: 'Asia/Tokyo',
    gdp: 42_000,
    internet_penetration: 92,
    ecommerce_adoption: 75,
    social_platforms: {
      google: 85,
      meta: 40,
      tiktok: 35,
      bing: 10,
      snapchat: 5,
    },
    ad_costs: {
      google: 2.5,
      meta: 1.8,
      tiktok: 0.9,
      bing: 1.2,
      snapchat: 0.6,
    },
    cultural_behavior: {
      formality: 'formal',
      humor: 'no',
      directness: 'indirect',
      emotional_appeal: 'harmony and quality',
      color_preferences: 'red,gold,white',
      taboos: 'direct confrontation,number 4,white flowers as gifts',
    },
    opportunity_score: 78,
    entry_strategy: 'strategic_partnership',
    is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Creates a standard AgentInput for testing.
 */
function buildTestInput(countryId: string = 'country-1'): AgentInput {
  return {
    context: {},
    parameters: { countryId },
    requestId: 'test-request-001',
  };
}

/**
 * Sets up mock DB responses for full blueprint generation.
 */
function setupFullMocks(country: Country): void {
  mockQuery
    // fetchCountryData
    .mockResolvedValueOnce({ rows: [country] })
    // fetchMarketData
    .mockResolvedValueOnce({
      rows: [
        {
          campaign_count: '5',
          active_count: '3',
          total_budget: '50000',
          total_spent: '32000',
          avg_roas: '2.8',
        },
      ],
    })
    // fetchCompetitorData
    .mockResolvedValueOnce({
      rows: [
        {
          competitor_count: '7',
          avg_spend: '15000',
          avg_share: '12',
        },
      ],
    });
}

// ------------------------------------------------------------------
// Test suite
// ------------------------------------------------------------------

describe('CountryStrategyAgent', () => {
  let agent: CountryStrategyAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    agent = new CountryStrategyAgent();
  });

  // ================================================================
  // Test 1: analyzeCulturalTone — formal East Asian market
  // ================================================================
  describe('analyzeCulturalTone', () => {
    it('should return formal tone with no humor for East Asian market with explicit cultural data', () => {
      const country = buildMockCountry({
        region: 'East Asia',
        cultural_behavior: {
          formality: 'formal',
          humor: 'no',
          directness: 'indirect',
          emotional_appeal: 'harmony and quality',
          color_preferences: 'red,gold,white',
          taboos: 'direct confrontation,number 4',
        },
      });

      const tone: CulturalToneProfile = agent.analyzeCulturalTone(country);

      expect(tone.formality).toBe('formal');
      expect(tone.humor).toBe(false);
      expect(tone.directness).toBe('indirect');
      expect(tone.emotionalAppeal).toBe('harmony and quality');
      expect(tone.colorPreferences).toEqual(['red', 'gold', 'white']);
      expect(tone.taboos).toContain('direct confrontation');
      expect(tone.taboos).toContain('number 4');
    });

    // ================================================================
    // Test 2: analyzeCulturalTone — casual North American market
    // ================================================================
    it('should return casual tone with humor for North American market with missing cultural data', () => {
      const country = buildMockCountry({
        name: 'United States',
        code: 'US',
        region: 'North America',
        language: 'en',
        currency: 'USD',
        cultural_behavior: {},
      });

      const tone: CulturalToneProfile = agent.analyzeCulturalTone(country);

      expect(tone.formality).toBe('casual');
      expect(tone.humor).toBe(true);
      expect(tone.directness).toBe('direct');
      expect(tone.emotionalAppeal).toBe('individuality and convenience');
      expect(tone.colorPreferences).toEqual(['blue', 'red', 'white']);
      expect(tone.taboos).toEqual([]);
    });

    // ================================================================
    // Test 3: analyzeCulturalTone — mixed region defaults
    // ================================================================
    it('should return mixed formality for Western Europe region', () => {
      const country = buildMockCountry({
        name: 'Germany',
        code: 'DE',
        region: 'Western Europe',
        language: 'de',
        cultural_behavior: {},
      });

      const tone: CulturalToneProfile = agent.analyzeCulturalTone(country);

      expect(tone.formality).toBe('mixed');
      expect(tone.humor).toBe(true);
      expect(tone.directness).toBe('direct');
      expect(tone.emotionalAppeal).toBe('innovation and sustainability');
    });
  });

  // ================================================================
  // Test 4: assessPriceSensitivity — high GDP, low sensitivity
  // ================================================================
  describe('assessPriceSensitivity', () => {
    it('should return low sensitivity for high-GDP country with high e-commerce adoption', () => {
      const country = buildMockCountry({
        gdp: 65_000,
        ecommerce_adoption: 80,
        ad_costs: { google: 4.0, meta: 3.5 },
      });

      const sensitivity: PriceSensitivityLevel = agent.assessPriceSensitivity(country);

      expect(sensitivity).toBe('low');
    });

    // ================================================================
    // Test 5: assessPriceSensitivity — low GDP, very high sensitivity
    // ================================================================
    it('should return very_high sensitivity for low-GDP country with low e-commerce adoption', () => {
      const country = buildMockCountry({
        gdp: 2_000,
        ecommerce_adoption: 10,
        ad_costs: { google: 0.3, meta: 0.2 },
      });

      const sensitivity: PriceSensitivityLevel = agent.assessPriceSensitivity(country);

      expect(sensitivity).toBe('very_high');
    });

    // ================================================================
    // Test 6: assessPriceSensitivity — medium GDP, missing data
    // ================================================================
    it('should return medium sensitivity when GDP and e-commerce data are absent', () => {
      const country = buildMockCountry({
        gdp: undefined,
        ecommerce_adoption: undefined,
        ad_costs: {},
      });

      const sensitivity: PriceSensitivityLevel = agent.assessPriceSensitivity(country);

      expect(sensitivity).toBe('medium');
    });
  });

  // ================================================================
  // Test 7: recommendPlatformMix — weighted distribution
  // ================================================================
  describe('recommendPlatformMix', () => {
    it('should allocate highest weight to platform with highest penetration', () => {
      const country = buildMockCountry({
        social_platforms: {
          google: 90,
          meta: 60,
          tiktok: 45,
          bing: 15,
          snapchat: 10,
        },
        ad_costs: {
          google: 2.0,
          meta: 1.5,
          tiktok: 0.8,
          bing: 1.0,
          snapchat: 0.5,
        },
      });

      const mix: PlatformMixRecommendation = agent.recommendPlatformMix(country);

      // Google should have the highest weight (highest penetration)
      const platforms = mix.platforms;
      expect(platforms.google.weight).toBeGreaterThan(platforms.snapchat.weight);
      expect(platforms.google.weight).toBeGreaterThan(platforms.bing.weight);

      // All weights must sum to 1.0
      const totalWeight = Object.values(platforms).reduce((s, p) => s + p.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 1);

      // Every platform should have a strategy string
      for (const platform of Object.values(platforms)) {
        expect(platform.strategy).toBeTruthy();
        expect(typeof platform.strategy).toBe('string');
      }
    });

    // ================================================================
    // Test 8: recommendPlatformMix — no social platform data
    // ================================================================
    it('should distribute evenly when no social platform data is available', () => {
      const country = buildMockCountry({
        social_platforms: {},
        ad_costs: {},
      });

      const mix: PlatformMixRecommendation = agent.recommendPlatformMix(country);
      const weights = Object.values(mix.platforms).map((p) => p.weight);

      // When all raw weights are 0, each should get 1/5 = 0.2 (with rounding adjustment)
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 1);

      // All platforms should have non-zero weight
      for (const w of weights) {
        expect(w).toBeGreaterThan(0);
      }
    });
  });

  // ================================================================
  // Test 9: validateStrategy — valid blueprint
  // ================================================================
  describe('validateStrategy', () => {
    it('should return valid: true for a complete and well-formed blueprint', () => {
      const blueprint: StrategyBlueprint = {
        countryId: 'country-1',
        countryCode: 'JP',
        brandPositioning: {
          positioning: 'Premium quality brand for Japanese consumers',
          differentiators: ['Local language support', 'Cultural relevance'],
          valueProposition: 'Best-in-class product with Japanese market focus',
          competitiveAdvantage: 'Early entrant with localized experience',
        },
        culturalTone: {
          formality: 'formal',
          humor: false,
          directness: 'indirect',
          emotionalAppeal: 'harmony and quality',
          colorPreferences: ['red', 'gold'],
          taboos: ['number 4'],
        },
        priceSensitivity: 'medium',
        messagingStyle: {
          primary: 'Trust-building narratives',
          secondary: 'Social proof through testimonials',
          callToAction: 'Discover our collection',
          avoidPhrases: ['cheap', 'discount'],
        },
        platformMix: {
          platforms: {
            google: { weight: 0.35, strategy: 'Primary search channel' },
            meta: { weight: 0.25, strategy: 'Social engagement' },
            tiktok: { weight: 0.20, strategy: 'Video content' },
            bing: { weight: 0.12, strategy: 'B2B supplement' },
            snapchat: { weight: 0.08, strategy: 'Gen Z awareness' },
          },
        },
        timeline: {
          phases: [
            {
              name: 'Research',
              duration: '4 weeks',
              actions: ['Market analysis', 'Focus groups'],
            },
            {
              name: 'Launch',
              duration: '3 weeks',
              actions: ['Campaign launch on Google'],
            },
          ],
        },
        risks: ['High competition'],
        opportunities: ['Strong digital adoption'],
        confidence: { score: 75, level: 'high', factors: { data: 80 } },
      };

      const result = agent.validateStrategy(blueprint);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    // ================================================================
    // Test 10: validateStrategy — multiple issues detected
    // ================================================================
    it('should return valid: false with specific issues for an incomplete blueprint', () => {
      const blueprint: StrategyBlueprint = {
        countryId: 'country-1',
        countryCode: 'JP',
        brandPositioning: {
          positioning: '',
          differentiators: [],
          valueProposition: '',
          competitiveAdvantage: 'Some advantage',
        },
        culturalTone: {
          formality: 'formal',
          humor: false,
          directness: 'indirect',
          emotionalAppeal: '',
          colorPreferences: [],
          taboos: [],
        },
        priceSensitivity: 'medium',
        messagingStyle: {
          primary: '',
          secondary: 'Secondary style',
          callToAction: '',
          avoidPhrases: [],
        },
        platformMix: {
          platforms: {
            google: { weight: 0.5, strategy: 'Search' },
            meta: { weight: 0.3, strategy: 'Social' },
            tiktok: { weight: 0.3, strategy: 'Video' },
            bing: { weight: 0.1, strategy: '' },
            snapchat: { weight: -0.1, strategy: 'Snap' },
          },
        },
        timeline: {
          phases: [],
        },
        risks: [],
        opportunities: [],
        confidence: { score: 30, level: 'low', factors: {} },
      };

      const result = agent.validateStrategy(blueprint);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(5);
      expect(result.issues).toContain('Brand positioning statement is empty');
      expect(result.issues).toContain('No brand differentiators defined');
      expect(result.issues).toContain('Value proposition is empty');
      expect(result.issues).toContain('Strategy timeline has no phases defined');
      expect(result.issues).toContain('Cultural tone is missing emotional appeal definition');
      expect(result.issues).toContain('Primary messaging style is empty');
      expect(result.issues).toContain('Call-to-action style is empty');

      // Platform issues
      const weightIssue = result.issues.find((i) => i.includes('weights sum'));
      expect(weightIssue).toBeDefined();

      const bingIssue = result.issues.find((i) => i.includes('bing') && i.includes('missing a strategy'));
      expect(bingIssue).toBeDefined();

      const snapIssue = result.issues.find((i) => i.includes('snapchat') && i.includes('out of range'));
      expect(snapIssue).toBeDefined();
    });
  });

  // ================================================================
  // Test 11: generateTimeline — phase count and structure
  // ================================================================
  describe('generateTimeline', () => {
    it('should generate a 4-phase timeline with correct structure', () => {
      const blueprint: StrategyBlueprint = {
        countryId: 'country-1',
        countryCode: 'JP',
        brandPositioning: {
          positioning: 'Premium brand',
          differentiators: ['Quality', 'Local'],
          valueProposition: 'Best product',
          competitiveAdvantage: 'First mover',
        },
        culturalTone: {
          formality: 'formal',
          humor: false,
          directness: 'indirect',
          emotionalAppeal: 'harmony',
          colorPreferences: ['red'],
          taboos: [],
        },
        priceSensitivity: 'very_high',
        messagingStyle: {
          primary: 'Trust-building',
          secondary: 'Social proof',
          callToAction: 'Discover more',
          avoidPhrases: [],
        },
        platformMix: {
          platforms: {
            google: { weight: 0.4, strategy: 'Primary' },
            meta: { weight: 0.25, strategy: 'Social' },
            tiktok: { weight: 0.20, strategy: 'Video' },
            bing: { weight: 0.10, strategy: 'B2B' },
            snapchat: { weight: 0.05, strategy: 'Awareness' },
          },
        },
        timeline: { phases: [] },
        risks: ['High competition', 'Regulatory complexity'],
        opportunities: ['Growing digital market'],
        confidence: { score: 70, level: 'high', factors: {} },
      };

      const timeline: StrategyTimeline = agent.generateTimeline(blueprint);

      expect(timeline.phases).toHaveLength(4);

      // Phase 1 should be Research
      expect(timeline.phases[0].name).toBe('Market Research & Preparation');
      expect(timeline.phases[0].duration).toBe('6 weeks'); // very_high price sensitivity = longer
      expect(timeline.phases[0].actions.length).toBeGreaterThan(0);

      // Phase 2 should be Soft Launch
      expect(timeline.phases[1].name).toBe('Soft Launch');
      expect(timeline.phases[1].duration).toBe('4 weeks'); // formal tone = longer
      expect(timeline.phases[1].actions.length).toBeGreaterThan(0);

      // Phase 3 should be Scale
      expect(timeline.phases[2].name).toBe('Scale & Optimize');
      expect(timeline.phases[2].actions.length).toBeGreaterThan(0);

      // Phase 4 should be Full Penetration
      expect(timeline.phases[3].name).toBe('Full Market Penetration');
      expect(timeline.phases[3].duration).toBe('Ongoing');

      // All actions should be non-empty strings
      for (const phase of timeline.phases) {
        for (const action of phase.actions) {
          expect(action).toBeTruthy();
          expect(typeof action).toBe('string');
        }
      }
    });
  });

  // ================================================================
  // Test 12: process — successful blueprint generation
  // ================================================================
  describe('process', () => {
    it('should return a successful AgentOutput with strategic blueprint', async () => {
      const country = buildMockCountry();
      setupFullMocks(country);

      // Mock the AI call to throw (so fallback positioning is used)
      // Since callAI is protected, we mock the dynamic import
      jest.spyOn(agent as any, 'callAI').mockRejectedValue(new Error('AI unavailable'));

      // Mock persistState and logDecision so they don't hit DB
      jest.spyOn(agent as any, 'persistState').mockResolvedValue(undefined);
      jest.spyOn(agent as any, 'logDecision').mockResolvedValue(undefined);

      const input = buildTestInput('country-1');
      const output: AgentOutput = await agent.process(input);

      expect(output.agentType).toBe('country_strategy');
      expect(output.decision).toBe('country_strategy_generated');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.reasoning).toContain('JP');
      expect(output.recommendations.length).toBeGreaterThan(0);
      expect(output.timestamp).toBeTruthy();

      // The blueprint data should be present
      const data = output.data as unknown as StrategyBlueprint;
      expect(data.countryCode).toBe('JP');
      expect(data.brandPositioning).toBeDefined();
      expect(data.culturalTone).toBeDefined();
      expect(data.priceSensitivity).toBeDefined();
      expect(data.messagingStyle).toBeDefined();
      expect(data.platformMix).toBeDefined();
      expect(data.timeline).toBeDefined();
    });

    // ================================================================
    // Test 13: process — missing countryId parameter
    // ================================================================
    it('should return failed output when countryId parameter is missing', async () => {
      const input: AgentInput = {
        context: {},
        parameters: {},
        requestId: 'test-request-no-country',
      };

      const output: AgentOutput = await agent.process(input);

      expect(output.decision).toBe('country_strategy_failed');
      expect(output.warnings).toContain('Missing required parameter: countryId');
      expect(output.confidence.score).toBe(0);
    });

    // ================================================================
    // Test 14: process — country not found in DB
    // ================================================================
    it('should return failed output when country is not found in DB', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No country found

      jest.spyOn(agent as any, 'persistState').mockResolvedValue(undefined);
      jest.spyOn(agent as any, 'logDecision').mockResolvedValue(undefined);

      const input = buildTestInput('nonexistent-country');
      const output: AgentOutput = await agent.process(input);

      expect(output.decision).toBe('country_strategy_failed');
      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.confidence.score).toBe(0);
    });
  });

  // ================================================================
  // Test 15: getChallengeTargets — returns correct agent types
  // ================================================================
  describe('getChallengeTargets', () => {
    it('should return market_intelligence, localization, and compliance as targets', () => {
      const targets = agent.getChallengeTargets();

      expect(targets).toEqual(['market_intelligence', 'localization', 'compliance']);
      expect(targets).toHaveLength(3);
    });
  });

  // ================================================================
  // Test 16: generateBlueprint — uses cache when available
  // ================================================================
  describe('generateBlueprint', () => {
    it('should return cached blueprint when cache hit occurs', async () => {
      const cachedBlueprint: StrategyBlueprint = {
        countryId: 'country-1',
        countryCode: 'JP',
        brandPositioning: {
          positioning: 'Cached position',
          differentiators: ['Cached'],
          valueProposition: 'Cached VP',
          competitiveAdvantage: 'Cached advantage',
        },
        culturalTone: {
          formality: 'formal',
          humor: false,
          directness: 'indirect',
          emotionalAppeal: 'harmony',
          colorPreferences: ['red'],
          taboos: [],
        },
        priceSensitivity: 'medium',
        messagingStyle: {
          primary: 'Cached primary',
          secondary: 'Cached secondary',
          callToAction: 'Cached CTA',
          avoidPhrases: [],
        },
        platformMix: {
          platforms: {
            google: { weight: 0.4, strategy: 'Cached' },
            meta: { weight: 0.25, strategy: 'Cached' },
            tiktok: { weight: 0.20, strategy: 'Cached' },
            bing: { weight: 0.10, strategy: 'Cached' },
            snapchat: { weight: 0.05, strategy: 'Cached' },
          },
        },
        timeline: {
          phases: [{ name: 'Phase 1', duration: '4 weeks', actions: ['Action 1'] }],
        },
        risks: ['Cached risk'],
        opportunities: ['Cached opportunity'],
        confidence: { score: 80, level: 'high', factors: { data: 80 } },
      };

      mockCacheGet.mockResolvedValueOnce(cachedBlueprint);

      const result = await agent.generateBlueprint('country-1');

      expect(result.brandPositioning.positioning).toBe('Cached position');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Test 17: assessPriceSensitivity — mid-range GDP, high sensitivity
  // ================================================================
  describe('assessPriceSensitivity - edge cases', () => {
    it('should return high sensitivity for mid-range GDP with low ecommerce and cheap ads', () => {
      const country = buildMockCountry({
        gdp: 8_000,
        ecommerce_adoption: 15,
        ad_costs: { google: 0.3, meta: 0.2 },
      });

      const sensitivity = agent.assessPriceSensitivity(country);

      expect(sensitivity).toBe('very_high');
    });
  });

  // ================================================================
  // Test 18: analyzeCulturalTone — Middle East region defaults
  // ================================================================
  describe('analyzeCulturalTone - Middle East defaults', () => {
    it('should return formal tone with indirect directness for Middle East region', () => {
      const country = buildMockCountry({
        name: 'Saudi Arabia',
        code: 'SA',
        region: 'Middle East',
        language: 'ar',
        cultural_behavior: {},
      });

      const tone = agent.analyzeCulturalTone(country);

      expect(tone.formality).toBe('formal');
      expect(tone.directness).toBe('indirect');
      expect(tone.emotionalAppeal).toBe('prestige and trust');
      expect(tone.colorPreferences).toEqual(['green', 'gold', 'blue']);
    });
  });
});

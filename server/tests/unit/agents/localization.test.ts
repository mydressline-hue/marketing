/**
 * Unit tests for LocalizationAgent (Agent 12: Multi-Language Localization).
 *
 * All external dependencies (database, Redis, AI, logger) are mocked so that
 * we exercise only the agent logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports so jest hoists them correctly
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
    ANTHROPIC_OPUS_MODEL: 'claude-opus-4-20250514',
    ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1234'),
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

// Mock callAI at the prototype level to avoid importing the real AnthropicClient
const mockCallAI = jest.fn();

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { LocalizationAgent } from '../../../src/agents/modules/LocalizationAgent';
import type {
  TranslationResult,
  BatchTranslationResult,
  CulturalAdaptationResult,
  CurrencyConversionResult,
  LegalComplianceResult,
  SupportedLanguages,
  LanguageDetection,
  TranslationValidation,
  CulturalRuleSet,
  CampaignLocalizationResult,
} from '../../../src/agents/modules/LocalizationAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';
import type { AgentInput } from '../../../src/agents/base/types';

// Typed mocks for convenience
const mockPoolQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeAgentInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    context: {},
    parameters: {},
    requestId: 'req-test-001',
    ...overrides,
  };
}

const TEST_COUNTRY = {
  id: 'country-jp-001',
  name: 'Japan',
  code: 'JP',
  region: 'Asia-Pacific',
  language: 'ja',
  currency: 'JPY',
  timezone: 'Asia/Tokyo',
  cultural_behavior: {
    formality: 'high',
    gift_giving: 'important',
    business_cards: 'essential',
  },
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const TEST_CONTENT = {
  id: 'content-001',
  title: 'Summer Sale',
  body: 'Get 50% off all products this weekend!',
  language: 'en',
  country_id: 'country-jp-001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalizationAgent', () => {
  let agent: LocalizationAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new LocalizationAgent();

    // Override the protected callAI method to avoid real API calls
    (agent as unknown as Record<string, unknown>)['callAI'] = mockCallAI;
  });

  // -----------------------------------------------------------------------
  // Constructor and base configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates agent with correct type and model', () => {
      expect(agent.getAgentType()).toBe('localization');
      expect(agent.getConfig().model).toBe('sonnet');
      expect(agent.getConfig().confidenceThreshold).toBe(70);
    });

    it('allows config overrides', () => {
      const custom = new LocalizationAgent({ confidenceThreshold: 85, maxRetries: 5 });
      expect(custom.getConfig().confidenceThreshold).toBe(85);
      expect(custom.getConfig().maxRetries).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // getChallengeTargets
  // -----------------------------------------------------------------------

  describe('getChallengeTargets', () => {
    it('returns content_blog, compliance, and country_strategy', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['content_blog', 'compliance', 'country_strategy']);
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a prompt that references localization responsibilities', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toContain('Multi-Language Localization');
      expect(prompt).toContain('translation');
      expect(prompt).toContain('Cultural adaptation');
      expect(prompt).toContain('Currency conversion');
      expect(prompt).toContain('Legal compliance');
    });
  });

  // -----------------------------------------------------------------------
  // getLanguageSupport
  // -----------------------------------------------------------------------

  describe('getLanguageSupport', () => {
    it('returns all 8 supported languages', () => {
      const support = agent.getLanguageSupport();
      expect(support.languages).toHaveLength(8);

      const codes = support.languages.map((l) => l.code);
      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('fr');
      expect(codes).toContain('de');
      expect(codes).toContain('ja');
      expect(codes).toContain('ko');
      expect(codes).toContain('pt');
      expect(codes).toContain('ar');
    });

    it('each language entry has code, name, nativeName, and supported flag', () => {
      const support = agent.getLanguageSupport();
      for (const lang of support.languages) {
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('name');
        expect(lang).toHaveProperty('nativeName');
        expect(lang.supported).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // translateContent
  // -----------------------------------------------------------------------

  describe('translateContent', () => {
    it('translates content and returns a TranslationResult', async () => {
      // Cache miss
      mockCacheGet.mockResolvedValueOnce(null);

      // Fetch content
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_CONTENT] });

      // Fetch country
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      // AI response for translation
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        translatedText: 'Summer Sale translated to Japanese',
        culturalAdaptations: ['Adjusted tone to formal'],
        qualityScore: 88,
        warnings: [],
      }));

      // Persist translation (INSERT)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Cache set
      mockCacheSet.mockResolvedValueOnce(undefined);

      const result = await agent.translateContent('content-001', 'ja', 'country-jp-001');

      expect(result.sourceLanguage).toBe('en');
      expect(result.targetLanguage).toBe('ja');
      expect(result.translatedText).toBe('Summer Sale translated to Japanese');
      expect(result.qualityScore).toBe(88);
      expect(result.culturalAdaptations).toContain('Adjusted tone to formal');
      expect(result.warnings).toEqual([]);
    });

    it('returns cached translation when available', async () => {
      const cachedResult: TranslationResult = {
        sourceLanguage: 'en',
        targetLanguage: 'ja',
        originalText: 'Hello',
        translatedText: 'Cached translation',
        culturalAdaptations: [],
        qualityScore: 92,
        warnings: [],
      };

      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await agent.translateContent('content-001', 'ja', 'country-jp-001');

      expect(result.translatedText).toBe('Cached translation');
      expect(result.qualityScore).toBe(92);
      expect(mockCallAI).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for non-existent content', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        agent.translateContent('nonexistent', 'ja', 'country-jp-001'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for unsupported language', async () => {
      await expect(
        agent.translateContent('content-001', 'zz' as any, 'country-jp-001'),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // convertCurrency
  // -----------------------------------------------------------------------

  describe('convertCurrency', () => {
    it('converts currency using database rate', async () => {
      // Cache miss
      mockCacheGet.mockResolvedValueOnce(null);

      // Direct rate lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ rate: 150.5, last_updated: '2026-02-25T10:00:00Z' }],
      });

      // Cache set
      mockCacheSet.mockResolvedValueOnce(undefined);

      const result = await agent.convertCurrency(100, 'USD', 'JPY');

      expect(result.originalAmount).toBe(100);
      expect(result.originalCurrency).toBe('USD');
      expect(result.targetCurrency).toBe('JPY');
      expect(result.rate).toBe(150.5);
      expect(result.convertedAmount).toBe(15050);
      expect(result.rateTimestamp).toBe('2026-02-25T10:00:00Z');
    });

    it('returns same amount when currencies match', async () => {
      const result = await agent.convertCurrency(100, 'USD', 'USD');

      expect(result.convertedAmount).toBe(100);
      expect(result.rate).toBe(1);
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('uses reverse rate when direct pair is not found', async () => {
      // Cache miss
      mockCacheGet.mockResolvedValueOnce(null);

      // Direct pair not found
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Reverse pair found
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ rate: 0.0067, last_updated: '2026-02-25T10:00:00Z' }],
      });

      // Cache set
      mockCacheSet.mockResolvedValueOnce(undefined);

      const result = await agent.convertCurrency(15000, 'JPY', 'USD');

      expect(result.originalCurrency).toBe('JPY');
      expect(result.targetCurrency).toBe('USD');
      expect(result.rate).toBeGreaterThan(0);
      expect(result.convertedAmount).toBeGreaterThan(0);
    });

    it('throws ValidationError for negative amounts', async () => {
      await expect(
        agent.convertCurrency(-100, 'USD', 'JPY'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when no exchange rate exists', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // Direct
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // Reverse

      await expect(
        agent.convertCurrency(100, 'XYZ', 'ABC'),
      ).rejects.toThrow(NotFoundError);
    });

    it('uses cached rate when available', async () => {
      mockCacheGet.mockResolvedValueOnce({
        rate: 150.5,
        timestamp: '2026-02-25T10:00:00Z',
      });

      const result = await agent.convertCurrency(100, 'USD', 'JPY');

      expect(result.convertedAmount).toBe(15050);
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // applyCulturalAdaptation
  // -----------------------------------------------------------------------

  describe('applyCulturalAdaptation', () => {
    it('applies cultural adaptations and returns result', async () => {
      // fetchCountry
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      // getCulturalRules: cache miss
      mockCacheGet.mockResolvedValueOnce(null);

      // getCulturalRules: fetchCountry (called again internally)
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      // getCulturalRules: compliance_rules query
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ regulation: 'APPI', name: 'Data collection disclosure' }],
      });

      // getCulturalRules: AI call
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        formality: 'formal',
        taboos: ['direct confrontation', 'aggressive sales language'],
        preferences: { tone: 'polite and respectful' },
      }));

      // getCulturalRules: cache set
      mockCacheSet.mockResolvedValueOnce(undefined);

      // Cultural adaptation AI call
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        adaptedText: 'Polite Japanese version of the text',
        adaptations: [
          {
            type: 'tone',
            original: 'Buy now!',
            adapted: 'We would be honoured if you considered our offer',
            reason: 'Japanese culture prefers indirect, polite language',
          },
        ],
        confidence: 85,
      }));

      const result = await agent.applyCulturalAdaptation(
        'Buy now! Best deal ever!',
        'country-jp-001',
      );

      expect(result.originalText).toBe('Buy now! Best deal ever!');
      expect(result.adaptedText).toBe('Polite Japanese version of the text');
      expect(result.adaptations).toHaveLength(1);
      expect(result.adaptations[0].type).toBe('tone');
      expect(result.confidence).toBe(85);
    });
  });

  // -----------------------------------------------------------------------
  // validateLegalCompliance
  // -----------------------------------------------------------------------

  describe('validateLegalCompliance', () => {
    it('returns compliant result when text passes checks', async () => {
      // fetchCountry
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      // compliance_rules
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            name: 'APPI Data Collection',
            regulation: 'appi',
            rule_definition: { requires_consent: true },
            severity: 'high',
          },
        ],
      });

      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        compliant: true,
        issues: [],
        requiredDisclosures: ['Data collection notice required'],
        suggestedText: null,
      }));

      const result = await agent.validateLegalCompliance(
        'Discover our premium products',
        'country-jp-001',
      );

      expect(result.compliant).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.requiredDisclosures).toContain('Data collection notice required');
    });

    it('returns non-compliant result with issues', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        compliant: false,
        issues: [
          {
            type: 'misleading_claim',
            description: 'Unsubstantiated health claim',
            severity: 'high',
            regulation: 'APPI',
          },
        ],
        requiredDisclosures: ['Health claim disclaimer required'],
        suggestedText: 'Revised compliant version of the text',
      }));

      const result = await agent.validateLegalCompliance(
        'Our product cures all diseases',
        'country-jp-001',
      );

      expect(result.compliant).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('high');
      expect(result.suggestedText).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // detectLanguage
  // -----------------------------------------------------------------------

  describe('detectLanguage', () => {
    it('detects language from text', async () => {
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        detectedLanguage: 'ja',
        confidence: 95,
        alternatives: [
          { language: 'ko', confidence: 3 },
        ],
      }));

      const result = await agent.detectLanguage('Konnichi wa');

      expect(result.detectedLanguage).toBe('ja');
      expect(result.confidence).toBe(95);
      expect(result.alternatives).toHaveLength(1);
    });

    it('throws ValidationError for empty text', async () => {
      await expect(agent.detectLanguage('')).rejects.toThrow(ValidationError);
      await expect(agent.detectLanguage('   ')).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // validateTranslation
  // -----------------------------------------------------------------------

  describe('validateTranslation', () => {
    it('validates a translation and returns quality assessment', async () => {
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        accurate: true,
        issues: [],
        qualityScore: 91,
        suggestions: ['Consider using a more colloquial expression in paragraph 2'],
      }));

      const result = await agent.validateTranslation(
        'Hello, world!',
        'Bonjour le monde!',
        'fr',
      );

      expect(result.accurate).toBe(true);
      expect(result.qualityScore).toBe(91);
      expect(result.issues).toEqual([]);
      expect(result.suggestions).toHaveLength(1);
    });

    it('throws ValidationError for unsupported language', async () => {
      await expect(
        agent.validateTranslation('Hello', 'Hola', 'zz' as any),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // getCulturalRules
  // -----------------------------------------------------------------------

  describe('getCulturalRules', () => {
    it('returns cultural rules from cache when available', async () => {
      const cachedRules: CulturalRuleSet = {
        countryId: 'country-jp-001',
        formality: 'formal',
        taboos: ['direct confrontation'],
        preferences: { tone: 'polite' },
        legalRequirements: ['APPI: Data collection'],
      };

      mockCacheGet.mockResolvedValueOnce(cachedRules);

      const result = await agent.getCulturalRules('country-jp-001');

      expect(result.countryId).toBe('country-jp-001');
      expect(result.formality).toBe('formal');
      expect(mockCallAI).not.toHaveBeenCalled();
    });

    it('derives cultural rules via AI when cache is empty', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ regulation: 'appi', name: 'Privacy notice' }],
      });

      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        formality: 'formal',
        taboos: ['aggressive selling'],
        preferences: { greeting: 'bow' },
      }));

      mockCacheSet.mockResolvedValueOnce(undefined);

      const result = await agent.getCulturalRules('country-jp-001');

      expect(result.formality).toBe('formal');
      expect(result.taboos).toContain('aggressive selling');
      expect(result.legalRequirements).toContain('appi: Privacy notice');
      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // process() - end-to-end through the agent input/output interface
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('processes a translate action and returns structured AgentOutput', async () => {
      // Cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // Content query
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_CONTENT] });
      // Country query
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        translatedText: 'Translated text for Japan',
        culturalAdaptations: ['Formalized greeting'],
        qualityScore: 82,
        warnings: [],
      }));

      // Persist translation
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockCacheSet.mockResolvedValueOnce(undefined);

      // logDecision
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const input = makeAgentInput({
        parameters: {
          action: 'translate',
          contentId: 'content-001',
          targetLanguage: 'ja',
          countryId: 'country-jp-001',
        },
      });

      const output = await agent.process(input);

      expect(output.agentType).toBe('localization');
      expect(output.decision).toContain('Translated content content-001 to ja');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeDefined();
      expect(output.timestamp).toBeDefined();
      expect(output.recommendations.length).toBeGreaterThan(0);
    });

    it('returns error output for unknown action', async () => {
      const input = makeAgentInput({
        parameters: { action: 'nonexistent_action' },
      });

      await expect(agent.process(input)).rejects.toThrow(ValidationError);
    });

    it('returns error output when required parameters are missing', async () => {
      const input = makeAgentInput({
        parameters: { action: 'translate' },
      });

      await expect(agent.process(input)).rejects.toThrow(ValidationError);
    });

    it('includes warnings in output when translation quality is low', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_CONTENT] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        translatedText: 'Low quality translation',
        culturalAdaptations: [],
        qualityScore: 45,
        warnings: ['Literal translation used due to insufficient context'],
      }));

      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockCacheSet.mockResolvedValueOnce(undefined);
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // logDecision

      const input = makeAgentInput({
        parameters: {
          action: 'translate',
          contentId: 'content-001',
          targetLanguage: 'ja',
          countryId: 'country-jp-001',
        },
      });

      const output = await agent.process(input);

      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.warnings.some((w) => w.includes('quality'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // localizeMarketingCampaign
  // -----------------------------------------------------------------------

  describe('localizeMarketingCampaign', () => {
    it('localizes all campaign creatives for a country', async () => {
      // fetchCountry
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });

      // Fetch campaign
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'camp-001', name: 'Summer JP', type: 'awareness' }],
      });

      // Fetch creatives
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { id: 'cr-1', name: 'Ad Copy 1', type: 'ad_copy', content: 'Buy our stuff!' },
          { id: 'cr-2', name: 'Video Script', type: 'video_script', content: 'Introducing...' },
        ],
      });

      // AI responses for each creative
      mockCallAI
        .mockResolvedValueOnce(JSON.stringify({
          localizedContent: 'Japanese ad copy',
          qualityScore: 87,
        }))
        .mockResolvedValueOnce(JSON.stringify({
          localizedContent: 'Japanese video script',
          qualityScore: 91,
        }));

      const result = await agent.localizeMarketingCampaign('camp-001', 'country-jp-001');

      expect(result.campaignId).toBe('camp-001');
      expect(result.countryId).toBe('country-jp-001');
      expect(result.localizedAssets).toHaveLength(2);
      expect(result.localizedAssets[0].localized).toBe('Japanese ad copy');
      expect(result.localizedAssets[1].localized).toBe('Japanese video script');
      expect(result.overallQuality).toBe(89);
    });

    it('throws NotFoundError for non-existent campaign', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [TEST_COUNTRY] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        agent.localizeMarketingCampaign('nonexistent', 'country-jp-001'),
      ).rejects.toThrow(NotFoundError);
    });
  });
});

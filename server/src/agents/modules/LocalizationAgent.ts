// ============================================================
// AI International Growth Engine - Agent 12: Multi-Language Localization
// Handles native-level translation (via Sonnet), cultural adaptation,
// currency conversion, and legal compliance messaging per country.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  AgentConfig,
} from '../base/types';
import type { AgentType, Language, Country, Content, Translation } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError, ExternalServiceError } from '../../utils/errors';

// ---- Result Types ----

export interface TranslationResult {
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  culturalAdaptations: string[];
  qualityScore: number;
  warnings: string[];
}

export interface BatchTranslationResult {
  translations: TranslationResult[];
  successCount: number;
  failureCount: number;
  averageQuality: number;
}

export interface Adaptation {
  type: 'tone' | 'imagery' | 'reference' | 'taboo' | 'humor';
  original: string;
  adapted: string;
  reason: string;
}

export interface CulturalAdaptationResult {
  originalText: string;
  adaptedText: string;
  adaptations: Adaptation[];
  confidence: number;
}

export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: string;
  rate: number;
  rateTimestamp: string;
}

export interface ComplianceIssue {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  regulation: string;
}

export interface LegalComplianceResult {
  compliant: boolean;
  issues: ComplianceIssue[];
  requiredDisclosures: string[];
  suggestedText?: string;
}

export interface SupportedLanguages {
  languages: {
    code: string;
    name: string;
    nativeName: string;
    supported: boolean;
  }[];
}

export interface LanguageDetection {
  detectedLanguage: string;
  confidence: number;
  alternatives: { language: string; confidence: number }[];
}

export interface TranslationValidation {
  accurate: boolean;
  issues: string[];
  qualityScore: number;
  suggestions: string[];
}

export interface CulturalRuleSet {
  countryId: string;
  formality: string;
  taboos: string[];
  preferences: Record<string, string>;
  legalRequirements: string[];
}

export interface CampaignLocalizationResult {
  campaignId: string;
  countryId: string;
  localizedAssets: { type: string; original: string; localized: string }[];
  overallQuality: number;
}

// ---- Constants ----

const CACHE_PREFIX = 'localization';
const TRANSLATION_CACHE_TTL = 3600; // 1 hour
const CURRENCY_CACHE_TTL = 300; // 5 minutes
const CULTURAL_RULES_CACHE_TTL = 86400; // 24 hours

const SUPPORTED_LANGUAGE_MAP: Record<string, { name: string; nativeName: string }> = {
  en: { name: 'English', nativeName: 'English' },
  es: { name: 'Spanish', nativeName: 'Espanol' },
  fr: { name: 'French', nativeName: 'Francais' },
  de: { name: 'German', nativeName: 'Deutsch' },
  ja: { name: 'Japanese', nativeName: 'Nihongo' },
  ko: { name: 'Korean', nativeName: 'Hangugeo' },
  pt: { name: 'Portuguese', nativeName: 'Portugues' },
  ar: { name: 'Arabic', nativeName: 'Al-Arabiyyah' },
};

// ============================================================
// LocalizationAgent
// ============================================================

export class LocalizationAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'localization' as AgentType,
      model: 'sonnet',
      maxRetries: 3,
      timeoutMs: 60000,
      confidenceThreshold: 70,
      ...config,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  getChallengeTargets(): AgentType[] {
    return ['content_blog', 'compliance', 'country_strategy'];
  }

  getSystemPrompt(): string {
    return [
      'You are Agent 12: Multi-Language Localization, a specialist within the AI International Growth Engine.',
      'Your responsibilities include:',
      '- Native-level translation across 8 supported languages (en, es, fr, de, ja, ko, pt, ar)',
      '- Cultural adaptation of marketing content for target markets',
      '- Currency conversion with real-time exchange rate awareness',
      '- Legal compliance messaging validation per country regulations',
      '',
      'Guidelines:',
      '- Provide translations that sound natural to native speakers, not literal word-for-word translations.',
      '- Adapt tone, imagery, references, humor, and avoid cultural taboos.',
      '- Flag any uncertainty regarding cultural norms or legal requirements.',
      '- Include quality scores based on fluency, accuracy, and cultural appropriateness.',
      '- Always respond with valid JSON matching the requested schema.',
    ].join('\n');
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing localization request', {
      requestId: input.requestId,
      action: input.parameters.action,
    });

    const action = input.parameters.action as string;
    const uncertainties: string[] = [];
    const warnings: string[] = [];
    let data: Record<string, unknown> = {};
    let decision: string;

    try {
      switch (action) {
        case 'translate': {
          const contentId = input.parameters.contentId as string;
          const targetLanguage = input.parameters.targetLanguage as Language;
          const countryId = input.parameters.countryId as string;

          if (!contentId || !targetLanguage || !countryId) {
            throw new ValidationError('Missing required parameters: contentId, targetLanguage, countryId');
          }

          const result = await this.translateContent(contentId, targetLanguage, countryId);
          data = result as unknown as Record<string, unknown>;
          decision = `Translated content ${contentId} to ${targetLanguage}`;

          if (result.qualityScore < 70) {
            warnings.push(`Translation quality score is below threshold: ${result.qualityScore}`);
          }
          if (result.warnings.length > 0) {
            warnings.push(...result.warnings);
          }
          break;
        }

        case 'batch_translate': {
          const contentIds = input.parameters.contentIds as string[];
          const targetLanguage = input.parameters.targetLanguage as Language;

          if (!contentIds?.length || !targetLanguage) {
            throw new ValidationError('Missing required parameters: contentIds, targetLanguage');
          }

          const result = await this.batchTranslate(contentIds, targetLanguage);
          data = result as unknown as Record<string, unknown>;
          decision = `Batch translated ${result.successCount}/${contentIds.length} items to ${targetLanguage}`;

          if (result.failureCount > 0) {
            warnings.push(`${result.failureCount} translations failed in batch`);
          }
          if (result.averageQuality < 70) {
            warnings.push(`Average translation quality is below threshold: ${result.averageQuality}`);
          }
          break;
        }

        case 'cultural_adaptation': {
          const text = input.parameters.text as string;
          const countryId = input.parameters.countryId as string;

          if (!text || !countryId) {
            throw new ValidationError('Missing required parameters: text, countryId');
          }

          const result = await this.applyCulturalAdaptation(text, countryId);
          data = result as unknown as Record<string, unknown>;
          decision = `Applied cultural adaptation for country ${countryId}`;

          if (result.confidence < 70) {
            uncertainties.push(
              this.flagUncertainty('cultural_rules', `Cultural adaptation confidence is low (${result.confidence}) for country ${countryId}`)
            );
          }
          break;
        }

        case 'convert_currency': {
          const amount = input.parameters.amount as number;
          const fromCurrency = input.parameters.fromCurrency as string;
          const toCurrency = input.parameters.toCurrency as string;

          if (amount === undefined || !fromCurrency || !toCurrency) {
            throw new ValidationError('Missing required parameters: amount, fromCurrency, toCurrency');
          }

          const result = await this.convertCurrency(amount, fromCurrency, toCurrency);
          data = result as unknown as Record<string, unknown>;
          decision = `Converted ${amount} ${fromCurrency} to ${toCurrency}`;
          break;
        }

        case 'validate_compliance': {
          const text = input.parameters.text as string;
          const countryId = input.parameters.countryId as string;

          if (!text || !countryId) {
            throw new ValidationError('Missing required parameters: text, countryId');
          }

          const result = await this.validateLegalCompliance(text, countryId);
          data = result as unknown as Record<string, unknown>;
          decision = result.compliant
            ? `Content is legally compliant for country ${countryId}`
            : `Content has compliance issues for country ${countryId}`;

          if (!result.compliant) {
            const highSeverity = result.issues.filter((i) => i.severity === 'high');
            if (highSeverity.length > 0) {
              warnings.push(
                `${highSeverity.length} high-severity compliance issues found`
              );
            }
          }
          break;
        }

        case 'localize_campaign': {
          const campaignId = input.parameters.campaignId as string;
          const countryId = input.parameters.countryId as string;

          if (!campaignId || !countryId) {
            throw new ValidationError('Missing required parameters: campaignId, countryId');
          }

          const result = await this.localizeMarketingCampaign(campaignId, countryId);
          data = result as unknown as Record<string, unknown>;
          decision = `Localized campaign ${campaignId} for country ${countryId}`;

          if (result.overallQuality < 70) {
            warnings.push(`Campaign localization quality is below threshold: ${result.overallQuality}`);
          }
          break;
        }

        case 'detect_language': {
          const text = input.parameters.text as string;

          if (!text) {
            throw new ValidationError('Missing required parameter: text');
          }

          const result = await this.detectLanguage(text);
          data = result as unknown as Record<string, unknown>;
          decision = `Detected language: ${result.detectedLanguage} (confidence: ${result.confidence})`;

          if (result.confidence < 70) {
            uncertainties.push(
              this.flagUncertainty('language_detection', `Language detection confidence is low: ${result.confidence}`)
            );
          }
          break;
        }

        default:
          throw new ValidationError(`Unknown localization action: ${action}`);
      }

      // Calculate confidence based on available factors
      const confidenceFactors: Record<string, number> = {
        action_validity: 90,
        data_availability: data ? 85 : 30,
      };

      // Add action-specific factors
      if (action === 'translate' || action === 'batch_translate') {
        const quality = (data as Record<string, unknown>).qualityScore as number
          ?? (data as Record<string, unknown>).averageQuality as number
          ?? 75;
        confidenceFactors.translation_quality = quality;
      }

      if (warnings.length > 0) {
        confidenceFactors.warning_impact = Math.max(30, 90 - warnings.length * 15);
      }

      if (uncertainties.length > 0) {
        confidenceFactors.uncertainty_impact = Math.max(20, 80 - uncertainties.length * 20);
      }

      const confidence = this.calculateConfidence(confidenceFactors);

      const output = this.buildOutput(
        decision,
        data,
        confidence,
        `Localization agent processed action '${action}' with ${warnings.length} warnings and ${uncertainties.length} uncertainties.`,
        this.generateRecommendations(action, warnings, uncertainties),
        warnings,
        uncertainties,
      );

      await this.logDecision(input, output);

      return output;
    } catch (error) {
      this.log.error('Localization processing failed', {
        requestId: input.requestId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }

      const confidence = this.calculateConfidence({
        action_validity: 0,
        data_availability: 0,
      });

      return this.buildOutput(
        `Localization action '${action}' failed`,
        { error: error instanceof Error ? error.message : String(error) },
        confidence,
        `Localization processing encountered an error: ${error instanceof Error ? error.message : String(error)}`,
        ['Retry the operation', 'Verify input parameters', 'Check service availability'],
        [error instanceof Error ? error.message : String(error)],
        [this.flagUncertainty('processing', 'Action failed and results are unavailable')],
      );
    }
  }

  // ------------------------------------------------------------------
  // Public methods
  // ------------------------------------------------------------------

  /**
   * Translates content identified by contentId into the target language,
   * applying cultural adaptations for the specified country.
   */
  async translateContent(
    contentId: string,
    targetLanguage: Language,
    countryId: string,
  ): Promise<TranslationResult> {
    this.log.info('Translating content', { contentId, targetLanguage, countryId });

    this.validateLanguage(targetLanguage);

    // Check cache
    const cacheKey = `${CACHE_PREFIX}:translate:${contentId}:${targetLanguage}:${countryId}`;
    const cached = await cacheGet<TranslationResult>(cacheKey);
    if (cached) {
      this.log.debug('Translation cache hit', { contentId, targetLanguage });
      return cached;
    }

    // Fetch source content from the database
    const contentResult = await pool.query(
      'SELECT id, title, body, language FROM content WHERE id = $1',
      [contentId],
    );

    if (contentResult.rows.length === 0) {
      throw new NotFoundError(`Content not found: ${contentId}`);
    }

    const content = contentResult.rows[0];
    const sourceLanguage = content.language || 'en';
    const sourceText = `${content.title}\n\n${content.body}`;

    // Fetch country cultural context
    const country = await this.fetchCountry(countryId);

    // Use AI for translation
    const translationPrompt = [
      `Translate the following content from ${sourceLanguage} to ${targetLanguage}.`,
      `Target country: ${country.name} (${country.code})`,
      `Cultural context: ${JSON.stringify(country.cultural_behavior || {})}`,
      '',
      'Provide a JSON response with the following structure:',
      '{',
      '  "translatedText": "the translated text",',
      '  "culturalAdaptations": ["list of cultural adaptations made"],',
      '  "qualityScore": 0-100,',
      '  "warnings": ["any warnings or notes"]',
      '}',
      '',
      'Source text:',
      sourceText,
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), translationPrompt, 'sonnet');

    const parsed = this.parseAIResponse<{
      translatedText: string;
      culturalAdaptations: string[];
      qualityScore: number;
      warnings: string[];
    }>(aiResponse);

    const result: TranslationResult = {
      sourceLanguage,
      targetLanguage,
      originalText: sourceText,
      translatedText: parsed.translatedText,
      culturalAdaptations: parsed.culturalAdaptations || [],
      qualityScore: this.clampScore(parsed.qualityScore),
      warnings: parsed.warnings || [],
    };

    // Persist translation record
    await this.persistTranslation(contentId, targetLanguage, result);

    // Cache the result
    await cacheSet(cacheKey, result, TRANSLATION_CACHE_TTL);

    this.log.info('Translation complete', {
      contentId,
      targetLanguage,
      qualityScore: result.qualityScore,
    });

    return result;
  }

  /**
   * Translates multiple content items in batch to the target language.
   */
  async batchTranslate(
    contentIds: string[],
    targetLanguage: Language,
  ): Promise<BatchTranslationResult> {
    this.log.info('Batch translating content', {
      count: contentIds.length,
      targetLanguage,
    });

    this.validateLanguage(targetLanguage);

    const translations: TranslationResult[] = [];
    let failureCount = 0;

    for (const contentId of contentIds) {
      try {
        // For batch, we use a generic country lookup from the content itself
        const contentResult = await pool.query(
          'SELECT country_id FROM content WHERE id = $1',
          [contentId],
        );

        if (contentResult.rows.length === 0) {
          this.log.warn('Content not found in batch', { contentId });
          failureCount++;
          continue;
        }

        const countryId = contentResult.rows[0].country_id;
        const result = await this.translateContent(contentId, targetLanguage, countryId);
        translations.push(result);
      } catch (error) {
        this.log.warn('Batch translation item failed', {
          contentId,
          error: error instanceof Error ? error.message : String(error),
        });
        failureCount++;
      }
    }

    const averageQuality =
      translations.length > 0
        ? Math.round(
            (translations.reduce((sum, t) => sum + t.qualityScore, 0) /
              translations.length) *
              100
          ) / 100
        : 0;

    return {
      translations,
      successCount: translations.length,
      failureCount,
      averageQuality,
    };
  }

  /**
   * Applies cultural adaptation rules to text for a specific country.
   */
  async applyCulturalAdaptation(
    text: string,
    countryId: string,
  ): Promise<CulturalAdaptationResult> {
    this.log.info('Applying cultural adaptation', { countryId, textLength: text.length });

    const country = await this.fetchCountry(countryId);
    const rules = await this.getCulturalRules(countryId);

    const adaptationPrompt = [
      `Culturally adapt the following marketing text for ${country.name} (${country.code}).`,
      '',
      'Cultural rules to apply:',
      `- Formality level: ${rules.formality}`,
      `- Taboos to avoid: ${JSON.stringify(rules.taboos)}`,
      `- Preferences: ${JSON.stringify(rules.preferences)}`,
      `- Legal requirements: ${JSON.stringify(rules.legalRequirements)}`,
      '',
      'Provide a JSON response:',
      '{',
      '  "adaptedText": "the culturally adapted text",',
      '  "adaptations": [',
      '    {',
      '      "type": "tone|imagery|reference|taboo|humor",',
      '      "original": "original phrase",',
      '      "adapted": "adapted phrase",',
      '      "reason": "why this change was made"',
      '    }',
      '  ],',
      '  "confidence": 0-100',
      '}',
      '',
      'Source text:',
      text,
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), adaptationPrompt, 'sonnet');

    const parsed = this.parseAIResponse<{
      adaptedText: string;
      adaptations: Adaptation[];
      confidence: number;
    }>(aiResponse);

    return {
      originalText: text,
      adaptedText: parsed.adaptedText,
      adaptations: parsed.adaptations || [],
      confidence: this.clampScore(parsed.confidence),
    };
  }

  /**
   * Converts a monetary amount between currencies using stored exchange rates.
   */
  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<CurrencyConversionResult> {
    this.log.info('Converting currency', { amount, fromCurrency, toCurrency });

    if (amount < 0) {
      throw new ValidationError('Currency amount must be non-negative');
    }

    const fromNorm = fromCurrency.toUpperCase();
    const toNorm = toCurrency.toUpperCase();

    if (fromNorm === toNorm) {
      return {
        originalAmount: amount,
        originalCurrency: fromNorm,
        convertedAmount: amount,
        targetCurrency: toNorm,
        rate: 1,
        rateTimestamp: new Date().toISOString(),
      };
    }

    // Check cache for rate
    const rateCacheKey = `${CACHE_PREFIX}:currency:${fromNorm}:${toNorm}`;
    const cachedRate = await cacheGet<{ rate: number; timestamp: string }>(rateCacheKey);

    if (cachedRate) {
      this.log.debug('Currency rate cache hit', { fromNorm, toNorm });
      const convertedAmount = Math.round(amount * cachedRate.rate * 100) / 100;
      return {
        originalAmount: amount,
        originalCurrency: fromNorm,
        convertedAmount,
        targetCurrency: toNorm,
        rate: cachedRate.rate,
        rateTimestamp: cachedRate.timestamp,
      };
    }

    // Look up rate in the database (currency_pairs table or similar)
    const rateResult = await pool.query(
      `SELECT rate, last_updated FROM currency_pairs
       WHERE "from" = $1 AND "to" = $2
       ORDER BY last_updated DESC LIMIT 1`,
      [fromNorm, toNorm],
    );

    if (rateResult.rows.length === 0) {
      // Try reverse pair
      const reverseResult = await pool.query(
        `SELECT rate, last_updated FROM currency_pairs
         WHERE "from" = $1 AND "to" = $2
         ORDER BY last_updated DESC LIMIT 1`,
        [toNorm, fromNorm],
      );

      if (reverseResult.rows.length === 0) {
        throw new NotFoundError(`Exchange rate not found for ${fromNorm}/${toNorm}`);
      }

      const reverseRate = reverseResult.rows[0].rate as number;
      const rate = Math.round((1 / reverseRate) * 1000000) / 1000000;
      const timestamp = reverseResult.rows[0].last_updated as string;

      await cacheSet(rateCacheKey, { rate, timestamp }, CURRENCY_CACHE_TTL);

      const convertedAmount = Math.round(amount * rate * 100) / 100;
      return {
        originalAmount: amount,
        originalCurrency: fromNorm,
        convertedAmount,
        targetCurrency: toNorm,
        rate,
        rateTimestamp: timestamp,
      };
    }

    const rate = rateResult.rows[0].rate as number;
    const timestamp = rateResult.rows[0].last_updated as string;

    await cacheSet(rateCacheKey, { rate, timestamp }, CURRENCY_CACHE_TTL);

    const convertedAmount = Math.round(amount * rate * 100) / 100;

    return {
      originalAmount: amount,
      originalCurrency: fromNorm,
      convertedAmount,
      targetCurrency: toNorm,
      rate,
      rateTimestamp: timestamp,
    };
  }

  /**
   * Validates text for legal compliance in a specific country,
   * checking regulation adherence and required disclosures.
   */
  async validateLegalCompliance(
    text: string,
    countryId: string,
  ): Promise<LegalComplianceResult> {
    this.log.info('Validating legal compliance', { countryId, textLength: text.length });

    const country = await this.fetchCountry(countryId);

    // Fetch compliance rules for the country
    const rulesResult = await pool.query(
      `SELECT id, name, regulation, rule_definition, severity
       FROM compliance_rules
       WHERE country_id = $1 AND is_active = true`,
      [countryId],
    );

    const rules = rulesResult.rows;

    const compliancePrompt = [
      `Analyze the following marketing text for legal compliance in ${country.name} (${country.code}).`,
      '',
      'Active compliance rules:',
      JSON.stringify(rules.map((r: Record<string, unknown>) => ({
        name: r.name,
        regulation: r.regulation,
        definition: r.rule_definition,
        severity: r.severity,
      }))),
      '',
      'Provide a JSON response:',
      '{',
      '  "compliant": true/false,',
      '  "issues": [',
      '    {',
      '      "type": "string",',
      '      "description": "string",',
      '      "severity": "low|medium|high",',
      '      "regulation": "string"',
      '    }',
      '  ],',
      '  "requiredDisclosures": ["disclosures that must be included"],',
      '  "suggestedText": "corrected text if non-compliant, or null"',
      '}',
      '',
      'Text to analyze:',
      text,
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), compliancePrompt, 'sonnet');

    const parsed = this.parseAIResponse<{
      compliant: boolean;
      issues: ComplianceIssue[];
      requiredDisclosures: string[];
      suggestedText?: string;
    }>(aiResponse);

    return {
      compliant: parsed.compliant,
      issues: parsed.issues || [],
      requiredDisclosures: parsed.requiredDisclosures || [],
      suggestedText: parsed.suggestedText || undefined,
    };
  }

  /**
   * Returns the list of all supported languages and their status.
   */
  getLanguageSupport(): SupportedLanguages {
    const languages = Object.entries(SUPPORTED_LANGUAGE_MAP).map(
      ([code, meta]) => ({
        code,
        name: meta.name,
        nativeName: meta.nativeName,
        supported: true,
      }),
    );

    return { languages };
  }

  /**
   * Detects the language of a given text using AI analysis.
   */
  async detectLanguage(text: string): Promise<LanguageDetection> {
    this.log.info('Detecting language', { textLength: text.length });

    if (!text.trim()) {
      throw new ValidationError('Text must not be empty for language detection');
    }

    const detectionPrompt = [
      'Detect the language of the following text.',
      '',
      'Provide a JSON response:',
      '{',
      '  "detectedLanguage": "ISO 639-1 code (e.g. en, es, fr)",',
      '  "confidence": 0-100,',
      '  "alternatives": [',
      '    { "language": "code", "confidence": 0-100 }',
      '  ]',
      '}',
      '',
      'Text:',
      text,
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), detectionPrompt, 'sonnet');

    const parsed = this.parseAIResponse<{
      detectedLanguage: string;
      confidence: number;
      alternatives: { language: string; confidence: number }[];
    }>(aiResponse);

    return {
      detectedLanguage: parsed.detectedLanguage,
      confidence: this.clampScore(parsed.confidence),
      alternatives: (parsed.alternatives || []).map((alt) => ({
        language: alt.language,
        confidence: this.clampScore(alt.confidence),
      })),
    };
  }

  /**
   * Validates a translation by comparing the original and translated text
   * for accuracy, completeness, and quality.
   */
  async validateTranslation(
    original: string,
    translated: string,
    language: Language,
  ): Promise<TranslationValidation> {
    this.log.info('Validating translation', { language, originalLength: original.length });

    this.validateLanguage(language);

    const validationPrompt = [
      `Validate the following translation to ${language}.`,
      '',
      'Provide a JSON response:',
      '{',
      '  "accurate": true/false,',
      '  "issues": ["list of accuracy or quality issues"],',
      '  "qualityScore": 0-100,',
      '  "suggestions": ["improvement suggestions"]',
      '}',
      '',
      'Original text:',
      original,
      '',
      'Translated text:',
      translated,
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), validationPrompt, 'sonnet');

    const parsed = this.parseAIResponse<{
      accurate: boolean;
      issues: string[];
      qualityScore: number;
      suggestions: string[];
    }>(aiResponse);

    return {
      accurate: parsed.accurate,
      issues: parsed.issues || [],
      qualityScore: this.clampScore(parsed.qualityScore),
      suggestions: parsed.suggestions || [],
    };
  }

  /**
   * Retrieves cultural rules for a specific country from the database
   * or derives them via AI analysis of country data.
   */
  async getCulturalRules(countryId: string): Promise<CulturalRuleSet> {
    this.log.info('Fetching cultural rules', { countryId });

    // Check cache
    const cacheKey = `${CACHE_PREFIX}:cultural_rules:${countryId}`;
    const cached = await cacheGet<CulturalRuleSet>(cacheKey);
    if (cached) {
      this.log.debug('Cultural rules cache hit', { countryId });
      return cached;
    }

    const country = await this.fetchCountry(countryId);

    // Fetch any existing compliance rules for legal requirements
    const complianceResult = await pool.query(
      `SELECT name, regulation, rule_definition
       FROM compliance_rules
       WHERE country_id = $1 AND is_active = true`,
      [countryId],
    );

    const legalRequirements = complianceResult.rows.map(
      (r: Record<string, unknown>) => `${r.regulation}: ${r.name}`,
    );

    // Use AI to derive cultural rules from country data
    const rulesPrompt = [
      `Derive marketing cultural rules for ${country.name} (${country.code}).`,
      `Region: ${country.region}`,
      `Language: ${country.language}`,
      `Cultural behavior data: ${JSON.stringify(country.cultural_behavior || {})}`,
      '',
      'Provide a JSON response:',
      '{',
      '  "formality": "formal|semi-formal|informal",',
      '  "taboos": ["cultural taboos to avoid in marketing"],',
      '  "preferences": { "key": "value pairs of cultural preferences" }',
      '}',
    ].join('\n');

    const aiResponse = await this.callAI(this.getSystemPrompt(), rulesPrompt, 'sonnet');

    const parsed = this.parseAIResponse<{
      formality: string;
      taboos: string[];
      preferences: Record<string, string>;
    }>(aiResponse);

    const ruleSet: CulturalRuleSet = {
      countryId,
      formality: parsed.formality || 'formal',
      taboos: parsed.taboos || [],
      preferences: parsed.preferences || {},
      legalRequirements,
    };

    await cacheSet(cacheKey, ruleSet, CULTURAL_RULES_CACHE_TTL);

    return ruleSet;
  }

  /**
   * Localizes an entire marketing campaign for a specific country,
   * translating and culturally adapting all campaign assets.
   */
  async localizeMarketingCampaign(
    campaignId: string,
    countryId: string,
  ): Promise<CampaignLocalizationResult> {
    this.log.info('Localizing marketing campaign', { campaignId, countryId });

    const country = await this.fetchCountry(countryId);
    const targetLanguage = country.language as Language;

    // Fetch campaign
    const campaignResult = await pool.query(
      'SELECT id, name, type FROM campaigns WHERE id = $1',
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign not found: ${campaignId}`);
    }

    // Fetch associated creatives
    const creativesResult = await pool.query(
      'SELECT id, name, type, content FROM creatives WHERE campaign_id = $1 AND is_active = true',
      [campaignId],
    );

    const creatives = creativesResult.rows;
    const localizedAssets: { type: string; original: string; localized: string }[] = [];
    const qualityScores: number[] = [];

    for (const creative of creatives) {
      try {
        const localizationPrompt = [
          `Translate and culturally adapt the following ${creative.type} content for ${country.name} (${country.code}).`,
          `Target language: ${targetLanguage}`,
          `Cultural context: ${JSON.stringify(country.cultural_behavior || {})}`,
          '',
          'Provide a JSON response:',
          '{',
          '  "localizedContent": "the localized content",',
          '  "qualityScore": 0-100',
          '}',
          '',
          'Source content:',
          creative.content,
        ].join('\n');

        const aiResponse = await this.callAI(
          this.getSystemPrompt(),
          localizationPrompt,
          'sonnet',
        );

        const parsed = this.parseAIResponse<{
          localizedContent: string;
          qualityScore: number;
        }>(aiResponse);

        localizedAssets.push({
          type: creative.type as string,
          original: creative.content as string,
          localized: parsed.localizedContent,
        });

        qualityScores.push(this.clampScore(parsed.qualityScore));
      } catch (error) {
        this.log.warn('Failed to localize creative', {
          creativeId: creative.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const overallQuality =
      qualityScores.length > 0
        ? Math.round(
            (qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length) * 100
          ) / 100
        : 0;

    return {
      campaignId,
      countryId,
      localizedAssets,
      overallQuality,
    };
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Fetches a country record from the database by ID.
   */
  private async fetchCountry(countryId: string): Promise<Country> {
    const result = await pool.query(
      'SELECT * FROM countries WHERE id = $1',
      [countryId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Country not found: ${countryId}`);
    }

    return result.rows[0] as Country;
  }

  /**
   * Validates that a language code is one of the supported languages.
   */
  private validateLanguage(language: string): void {
    if (!SUPPORTED_LANGUAGE_MAP[language]) {
      throw new ValidationError(
        `Unsupported language: ${language}. Supported: ${Object.keys(SUPPORTED_LANGUAGE_MAP).join(', ')}`,
      );
    }
  }

  /**
   * Persists a translation record to the database.
   */
  private async persistTranslation(
    contentId: string,
    language: string,
    result: TranslationResult,
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await pool.query(
        `INSERT INTO translations (id, source_content_id, language, translated_text, cultural_adaptations, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (source_content_id, language)
         DO UPDATE SET translated_text = $4, cultural_adaptations = $5, status = $6, updated_at = $7`,
        [
          generateId(),
          contentId,
          language,
          result.translatedText,
          JSON.stringify({
            tone_adjustments: result.culturalAdaptations,
            imagery_notes: [],
            taboo_topics: [],
            local_references: [],
          }),
          'completed',
          now,
        ],
      );
    } catch (error) {
      this.log.warn('Failed to persist translation record', {
        contentId,
        language,
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal: translation was successful even if persistence fails
    }
  }

  /**
   * Safely parses an AI JSON response, handling markdown code fences
   * and other formatting artefacts.
   */
  private parseAIResponse<T>(response: string): T {
    let cleaned = response.trim();

    // Strip markdown code fences if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }

    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      this.log.error('Failed to parse AI response as JSON', {
        responseLength: response.length,
        responsePreview: response.substring(0, 200),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalServiceError(
        'anthropic-api',
        `AI response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clamps a numeric score to the 0-100 range.
   */
  private clampScore(score: number | undefined | null): number {
    if (score === undefined || score === null || isNaN(score)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  /**
   * Generates contextual recommendations based on the action and any
   * warnings or uncertainties encountered during processing.
   */
  private generateRecommendations(
    action: string,
    warnings: string[],
    uncertainties: string[],
  ): string[] {
    const recommendations: string[] = [];

    if (action === 'translate' || action === 'batch_translate') {
      recommendations.push('Review translations with a native speaker before publishing');
      if (warnings.some((w) => w.includes('quality'))) {
        recommendations.push('Consider requesting a re-translation with additional context');
      }
    }

    if (action === 'cultural_adaptation') {
      recommendations.push('Validate cultural adaptations with in-market team');
      if (uncertainties.length > 0) {
        recommendations.push('Consult local cultural expert for areas of uncertainty');
      }
    }

    if (action === 'validate_compliance') {
      if (warnings.some((w) => w.includes('high-severity'))) {
        recommendations.push('Address high-severity compliance issues before publishing');
        recommendations.push('Consult legal counsel for regulatory interpretation');
      }
    }

    if (action === 'localize_campaign') {
      recommendations.push('Run A/B tests comparing localized vs. original campaign assets');
      recommendations.push('Monitor post-launch performance metrics per market');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring localization quality metrics');
    }

    return recommendations;
  }
}

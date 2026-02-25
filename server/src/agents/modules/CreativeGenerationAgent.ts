// ============================================================
// AI International Growth Engine - Creative Generation Agent (Agent 6)
// Handles ad copy, video scripts, UGC scripts, and brand tone validation
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import { calculateWeightedConfidence } from '../base/ConfidenceScoring';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import type { AgentType, CreativePerformance, FatigueScore, Platform } from '../../types';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  AgentConfig,
} from '../base/types';

// ============================================================
// Type Definitions
// ============================================================

export interface AdCopyVariant {
  /** Headline text for this variant */
  headline: string;
  /** Description / body text for this variant */
  description: string;
  /** The messaging angle this variant takes (e.g. 'urgency', 'social_proof') */
  angle: string;
}

export interface GeneratedAdCopy {
  /** Primary headline */
  headline: string;
  /** Primary description / body */
  description: string;
  /** Call to action text */
  callToAction: string;
  /** Target platform identifier */
  platform: string;
  /** Alternative copy variants exploring different angles */
  variants: AdCopyVariant[];
}

export interface Scene {
  /** Sequential scene number (1-based) */
  number: number;
  /** Description of the visual / on-screen elements */
  visual: string;
  /** Audio direction (music, SFX, dialogue) */
  audio: string;
  /** Duration of this scene in seconds */
  duration: number;
  /** Optional on-screen text overlay */
  text?: string;
}

export interface VideoScript {
  /** Working title for the video */
  title: string;
  /** Ordered list of scenes */
  scenes: Scene[];
  /** Total target duration in seconds */
  duration: number;
  /** Full voiceover script */
  voiceover: string;
  /** Closing call to action */
  callToAction: string;
}

export interface UGCScript {
  /** Attention-grabbing opening hook */
  hook: string;
  /** Main body content / talking script */
  body: string;
  /** Closing call to action */
  callToAction: string;
  /** Key points the creator should cover */
  talkingPoints: string[];
  /** Desired tone (e.g. 'casual', 'authoritative', 'enthusiastic') */
  tone: string;
}

export interface BrandGuidelines {
  /** Overall brand tone descriptor (e.g. 'professional', 'playful') */
  tone: string;
  /** Voice characteristics to embody (e.g. ['confident', 'warm', 'inclusive']) */
  voiceAttributes: string[];
  /** Words and phrases to avoid in all content */
  avoidWords: string[];
  /** Brand colour palette (hex codes) */
  colorPalette: string[];
  /** Typography / font direction */
  typography: string;
}

export interface ToneIssue {
  /** Category of the issue (e.g. 'word_choice', 'sentence_structure', 'tone_mismatch') */
  type: string;
  /** Location within the content where the issue was detected */
  location: string;
  /** Human-readable description of the problem */
  issue: string;
  /** Suggested fix or alternative */
  fix: string;
}

export interface BrandToneValidation {
  /** Whether the content is consistent with brand guidelines overall */
  consistent: boolean;
  /** Numeric consistency score (0-100) */
  score: number;
  /** Specific issues identified */
  issues: ToneIssue[];
  /** General improvement suggestions */
  suggestions: string[];
}

export interface RotationSuggestion {
  /** Creative IDs that should be retired due to fatigue or poor performance */
  retire: string[];
  /** Creative IDs that should continue running */
  keep: string[];
  /** Number of new creatives needed to maintain rotation health */
  newCreativesNeeded: number;
  /** Explanation for the rotation recommendation */
  reasoning: string;
}

// ============================================================
// Constants
// ============================================================

const CACHE_TTL_SECONDS = 900; // 15 minutes
const FATIGUE_CACHE_PREFIX = 'creative:fatigue:';
const PERFORMANCE_CACHE_PREFIX = 'creative:performance:';

/** Platform-specific character limits for ad copy */
const PLATFORM_LIMITS: Record<string, { headline: number; description: number }> = {
  google: { headline: 30, description: 90 },
  meta: { headline: 40, description: 125 },
  tiktok: { headline: 100, description: 150 },
  snapchat: { headline: 34, description: 150 },
  bing: { headline: 30, description: 90 },
};

/** Default fatigue threshold above which a creative should be considered for retirement */
const FATIGUE_RETIREMENT_THRESHOLD = 0.7;

/** Default minimum number of impressions before fatigue calculations are meaningful */
const MIN_IMPRESSIONS_FOR_FATIGUE = 1000;

// ============================================================
// CreativeGenerationAgent
// ============================================================

export class CreativeGenerationAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'creative_generation',
      model: 'sonnet',
      maxRetries: 3,
      timeoutMs: 60000,
      confidenceThreshold: 65,
      ...config,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the agent types that this agent is qualified to challenge
   * through the cross-challenge protocol.
   */
  getChallengeTargets(): AgentType[] {
    return ['brand_consistency', 'organic_social', 'paid_ads'];
  }

  /**
   * Returns the system prompt that shapes the AI persona for creative generation tasks.
   */
  getSystemPrompt(): string {
    return [
      'You are an expert creative strategist for international digital marketing campaigns.',
      'You generate high-performing ad copy, video scripts, and UGC scripts tailored to specific platforms, countries, and audiences.',
      'You always respect brand guidelines and tone of voice.',
      'You provide structured JSON output and never fabricate performance data.',
      'When you lack sufficient context, clearly flag your uncertainty.',
      'Always consider cultural nuances and local market context when generating creative content.',
      'Respond ONLY with valid JSON matching the requested schema.',
    ].join(' ');
  }

  /**
   * Core processing method. Interprets the input context to determine which
   * creative generation task to perform and dispatches accordingly.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing creative generation request', {
      requestId: input.requestId,
      task: input.parameters.task,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];

    const task = input.parameters.task as string | undefined;

    if (!task) {
      return this.buildOutput(
        'creative_generation_error',
        {},
        this.calculateConfidence({ input_quality: 0 }),
        'No task specified in parameters. Expected one of: generate_ad_copy, generate_video_script, generate_ugc_script, validate_brand_tone, calculate_fatigue, suggest_rotation.',
        [],
        ['Missing required parameter: task'],
        [this.flagUncertainty('input', 'No task parameter provided')],
      );
    }

    try {
      let data: Record<string, unknown> = {};
      let decision = '';
      let reasoning = '';
      let confidence: AgentConfidenceScore;
      const recommendations: string[] = [];

      switch (task) {
        case 'generate_ad_copy': {
          const campaignId = input.parameters.campaignId as string;
          const platform = input.parameters.platform as string;
          const countryId = input.parameters.countryId as string;

          if (!campaignId || !platform || !countryId) {
            warnings.push('Missing required parameters for ad copy generation (campaignId, platform, countryId)');
            uncertainties.push(
              this.flagUncertainty('input', 'Incomplete parameters for ad copy generation'),
            );
          }

          const adCopy = await this.generateAdCopy(campaignId, platform, countryId);
          data = { adCopy };
          decision = 'ad_copy_generated';
          reasoning = `Generated ad copy for platform "${platform}" targeting country "${countryId}" with ${adCopy.variants.length} variant(s).`;
          confidence = this.calculateConfidence({
            input_completeness: campaignId && platform && countryId ? 80 : 40,
            platform_support: platform in PLATFORM_LIMITS ? 90 : 50,
            ai_generation: 75,
          });
          recommendations.push(
            'A/B test the generated variants against each other',
            'Validate copy with local market experts before launch',
          );
          break;
        }

        case 'generate_video_script': {
          const topic = input.parameters.topic as string;
          const platform = input.parameters.platform as string;
          const duration = input.parameters.duration as number;
          const countryId = input.parameters.countryId as string;

          const script = await this.generateVideoScript(topic, platform, duration, countryId);
          data = { videoScript: script };
          decision = 'video_script_generated';
          reasoning = `Generated ${script.scenes.length}-scene video script "${script.title}" for ${duration}s on ${platform}.`;
          confidence = this.calculateConfidence({
            input_completeness: topic && platform ? 85 : 45,
            duration_feasibility: duration && duration > 0 && duration <= 300 ? 90 : 50,
            ai_generation: 70,
          });
          recommendations.push(
            'Review scene transitions for visual coherence',
            'Test voiceover timing against actual scene durations',
          );
          break;
        }

        case 'generate_ugc_script': {
          const product = input.parameters.product as string;
          const platform = input.parameters.platform as string;
          const countryId = input.parameters.countryId as string;

          const ugcScript = await this.generateUGCScript(product, platform, countryId);
          data = { ugcScript };
          decision = 'ugc_script_generated';
          reasoning = `Generated UGC script for product "${product}" on ${platform} with ${ugcScript.talkingPoints.length} talking points.`;
          confidence = this.calculateConfidence({
            input_completeness: product && platform ? 80 : 40,
            platform_fit: 75,
            ai_generation: 70,
          });
          recommendations.push(
            'Brief the creator on brand guidelines alongside the script',
            'Allow creator flexibility to adapt tone naturally',
          );
          break;
        }

        case 'validate_brand_tone': {
          const content = input.parameters.content as string;
          const brandGuidelines = input.parameters.brandGuidelines as BrandGuidelines;

          if (!content || !brandGuidelines) {
            warnings.push('Content and brandGuidelines are required for tone validation');
          }

          const validation = await this.validateBrandTone(content, brandGuidelines);
          data = { brandToneValidation: validation };
          decision = validation.consistent ? 'brand_tone_consistent' : 'brand_tone_inconsistent';
          reasoning = `Brand tone validation scored ${validation.score}/100 with ${validation.issues.length} issue(s) found.`;
          confidence = this.calculateConfidence({
            input_completeness: content && brandGuidelines ? 90 : 30,
            guidelines_specificity: brandGuidelines?.voiceAttributes?.length > 0 ? 85 : 50,
            analysis_depth: 80,
          });
          if (!validation.consistent) {
            recommendations.push(...validation.suggestions);
          }
          break;
        }

        case 'calculate_fatigue': {
          const creativeId = input.parameters.creativeId as string;
          const fatigueScore = await this.calculateFatigueScore(creativeId);
          data = { fatigueScore };
          decision = fatigueScore.score >= FATIGUE_RETIREMENT_THRESHOLD
            ? 'creative_fatigued'
            : 'creative_healthy';
          reasoning = `Fatigue score for creative "${creativeId}": ${fatigueScore.score.toFixed(2)}. ${fatigueScore.recommendation}`;
          confidence = this.calculateConfidence({
            data_availability: fatigueScore.factors.impressions_volume ? 85 : 40,
            calculation_reliability: 80,
          });
          if (fatigueScore.score >= FATIGUE_RETIREMENT_THRESHOLD) {
            recommendations.push(
              'Consider rotating this creative out',
              'Generate fresh variants to replace it',
            );
          }
          break;
        }

        case 'suggest_rotation': {
          const campaignId = input.parameters.campaignId as string;
          const rotation = await this.suggestCreativeRotation(campaignId);
          data = { rotationSuggestion: rotation };
          decision = 'rotation_suggested';
          reasoning = rotation.reasoning;
          confidence = this.calculateConfidence({
            data_availability: 75,
            analysis_depth: 70,
          });
          recommendations.push(
            `Retire ${rotation.retire.length} creative(s) and create ${rotation.newCreativesNeeded} new one(s)`,
          );
          break;
        }

        default:
          return this.buildOutput(
            'creative_generation_error',
            {},
            this.calculateConfidence({ input_quality: 0 }),
            `Unknown task: "${task}". Supported tasks: generate_ad_copy, generate_video_script, generate_ugc_script, validate_brand_tone, calculate_fatigue, suggest_rotation.`,
            [],
            [`Unsupported task type: ${task}`],
            [this.flagUncertainty('input', `Unknown task "${task}"`)],
          );
      }

      const output = this.buildOutput(
        decision,
        data,
        confidence!,
        reasoning,
        recommendations,
        warnings,
        uncertainties,
      );

      await this.logDecision(input, output);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Creative generation failed', { error: message, requestId: input.requestId });

      return this.buildOutput(
        'creative_generation_error',
        { error: message },
        this.calculateConfidence({ reliability: 0 }),
        `Creative generation task "${task}" failed: ${message}`,
        ['Retry with corrected parameters', 'Check AI service availability'],
        [`Processing error: ${message}`],
        [this.flagUncertainty('processing', `Task "${task}" encountered an error`)],
      );
    }
  }

  // ------------------------------------------------------------------
  // Public domain methods
  // ------------------------------------------------------------------

  /**
   * Generates ad copy for a given campaign, platform, and country.
   * Fetches campaign and country context from the database, then uses AI
   * to produce platform-appropriate copy with variants.
   */
  async generateAdCopy(
    campaignId: string,
    platform: string,
    countryId: string,
  ): Promise<GeneratedAdCopy> {
    this.log.info('Generating ad copy', { campaignId, platform, countryId });

    // Fetch campaign context
    const campaignResult = await pool.query(
      `SELECT c.id, c.name, c.type, c.budget, c.targeting,
              co.name AS country_name, co.language, co.cultural_behavior
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [campaignId],
    );

    const campaign = campaignResult.rows[0];
    if (!campaign) {
      this.log.warn('Campaign not found for ad copy generation', { campaignId });
    }

    // Fetch country context if not joined
    const countryResult = await pool.query(
      `SELECT name, language, cultural_behavior, social_platforms FROM countries WHERE id = $1`,
      [countryId],
    );
    const country = countryResult.rows[0];

    const limits = PLATFORM_LIMITS[platform] || { headline: 50, description: 150 };

    const userPrompt = JSON.stringify({
      task: 'generate_ad_copy',
      campaign: campaign || { id: campaignId },
      country: country || { id: countryId },
      platform,
      constraints: {
        maxHeadlineLength: limits.headline,
        maxDescriptionLength: limits.description,
      },
      outputSchema: {
        headline: 'string',
        description: 'string',
        callToAction: 'string',
        platform: 'string',
        variants: [{ headline: 'string', description: 'string', angle: 'string' }],
      },
    });

    const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
    const parsed = this.parseAIResponse<GeneratedAdCopy>(aiResponse);

    if (parsed) {
      return {
        headline: parsed.headline || '',
        description: parsed.description || '',
        callToAction: parsed.callToAction || '',
        platform,
        variants: Array.isArray(parsed.variants) ? parsed.variants : [],
      };
    }

    // Fallback: return structured empty response indicating AI parse failure
    this.log.warn('Failed to parse AI response for ad copy, returning empty structure');
    return {
      headline: '',
      description: '',
      callToAction: '',
      platform,
      variants: [],
    };
  }

  /**
   * Generates a video script with scene breakdowns, voiceover text, and timing.
   */
  async generateVideoScript(
    topic: string,
    platform: string,
    duration: number,
    countryId: string,
  ): Promise<VideoScript> {
    this.log.info('Generating video script', { topic, platform, duration, countryId });

    const countryResult = await pool.query(
      `SELECT name, language, cultural_behavior FROM countries WHERE id = $1`,
      [countryId],
    );
    const country = countryResult.rows[0];

    const userPrompt = JSON.stringify({
      task: 'generate_video_script',
      topic,
      platform,
      targetDuration: duration,
      country: country || { id: countryId },
      outputSchema: {
        title: 'string',
        scenes: [{ number: 'number', visual: 'string', audio: 'string', duration: 'number', text: 'string (optional)' }],
        duration: 'number',
        voiceover: 'string',
        callToAction: 'string',
      },
    });

    const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
    const parsed = this.parseAIResponse<VideoScript>(aiResponse);

    if (parsed) {
      return {
        title: parsed.title || '',
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        duration: parsed.duration || duration,
        voiceover: parsed.voiceover || '',
        callToAction: parsed.callToAction || '',
      };
    }

    this.log.warn('Failed to parse AI response for video script');
    return {
      title: '',
      scenes: [],
      duration,
      voiceover: '',
      callToAction: '',
    };
  }

  /**
   * Generates a UGC (user-generated content) script for creator briefing.
   */
  async generateUGCScript(
    product: string,
    platform: string,
    countryId: string,
  ): Promise<UGCScript> {
    this.log.info('Generating UGC script', { product, platform, countryId });

    const countryResult = await pool.query(
      `SELECT name, language, cultural_behavior FROM countries WHERE id = $1`,
      [countryId],
    );
    const country = countryResult.rows[0];

    const userPrompt = JSON.stringify({
      task: 'generate_ugc_script',
      product,
      platform,
      country: country || { id: countryId },
      outputSchema: {
        hook: 'string',
        body: 'string',
        callToAction: 'string',
        talkingPoints: ['string'],
        tone: 'string',
      },
    });

    const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
    const parsed = this.parseAIResponse<UGCScript>(aiResponse);

    if (parsed) {
      return {
        hook: parsed.hook || '',
        body: parsed.body || '',
        callToAction: parsed.callToAction || '',
        talkingPoints: Array.isArray(parsed.talkingPoints) ? parsed.talkingPoints : [],
        tone: parsed.tone || '',
      };
    }

    this.log.warn('Failed to parse AI response for UGC script');
    return {
      hook: '',
      body: '',
      callToAction: '',
      talkingPoints: [],
      tone: '',
    };
  }

  /**
   * Validates content against brand tone guidelines using AI analysis.
   * Returns a structured assessment with issue details and improvement suggestions.
   */
  async validateBrandTone(
    content: string,
    brandGuidelines: BrandGuidelines,
  ): Promise<BrandToneValidation> {
    this.log.info('Validating brand tone', {
      contentLength: content?.length || 0,
      guidelineTone: brandGuidelines?.tone,
    });

    if (!content || !brandGuidelines) {
      return {
        consistent: false,
        score: 0,
        issues: [{
          type: 'missing_input',
          location: 'N/A',
          issue: 'Content or brand guidelines were not provided',
          fix: 'Provide both content and brand guidelines for validation',
        }],
        suggestions: ['Provide valid content and brand guidelines'],
      };
    }

    const userPrompt = JSON.stringify({
      task: 'validate_brand_tone',
      content,
      brandGuidelines,
      outputSchema: {
        consistent: 'boolean',
        score: 'number (0-100)',
        issues: [{ type: 'string', location: 'string', issue: 'string', fix: 'string' }],
        suggestions: ['string'],
      },
    });

    const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
    const parsed = this.parseAIResponse<BrandToneValidation>(aiResponse);

    if (parsed) {
      const score = typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, parsed.score))
        : 0;
      return {
        consistent: typeof parsed.consistent === 'boolean' ? parsed.consistent : score >= 70,
        score,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    }

    this.log.warn('Failed to parse AI response for brand tone validation');
    return {
      consistent: false,
      score: 0,
      issues: [],
      suggestions: ['AI analysis could not be completed; manual review recommended'],
    };
  }

  /**
   * Calculates a fatigue score for a creative based on its performance trajectory.
   *
   * Fatigue is computed from real performance metrics: impression volume,
   * CTR trend decay, engagement rate decline, and time in rotation.
   * The score ranges from 0.0 (fresh) to 1.0 (fully fatigued).
   */
  async calculateFatigueScore(creativeId: string): Promise<FatigueScore> {
    this.log.info('Calculating fatigue score', { creativeId });

    // Check cache first
    const cached = await cacheGet<FatigueScore>(`${FATIGUE_CACHE_PREFIX}${creativeId}`);
    if (cached) {
      this.log.debug('Returning cached fatigue score', { creativeId });
      return cached;
    }

    // Fetch creative and its performance data
    const creativeResult = await pool.query(
      `SELECT id, name, type, campaign_id, fatigue_score, is_active, created_at, updated_at,
              performance
       FROM creatives
       WHERE id = $1`,
      [creativeId],
    );

    const creative = creativeResult.rows[0];
    if (!creative) {
      this.log.warn('Creative not found for fatigue calculation', { creativeId });
      return {
        score: 0,
        factors: {},
        recommendation: 'Creative not found. Unable to calculate fatigue.',
      };
    }

    const performance: CreativePerformance | undefined =
      typeof creative.performance === 'string'
        ? JSON.parse(creative.performance)
        : creative.performance;

    // Calculate individual fatigue factors
    const factors: Record<string, number> = {};

    // Factor 1: Impression volume saturation
    const impressions = performance?.impressions || 0;
    if (impressions < MIN_IMPRESSIONS_FOR_FATIGUE) {
      factors.impressions_volume = 0;
    } else {
      // Sigmoid-like scaling: more impressions -> higher fatigue contribution
      factors.impressions_volume = Math.min(1, impressions / 500000);
    }

    // Factor 2: CTR decay — compare current CTR to a reasonable baseline
    const ctr = performance?.ctr || 0;
    // Lower CTR relative to a typical baseline suggests fatigue
    const ctrBaseline = 2.0; // 2% as a reasonable industry average
    if (ctr > 0 && ctr < ctrBaseline) {
      factors.ctr_decay = Math.min(1, (ctrBaseline - ctr) / ctrBaseline);
    } else {
      factors.ctr_decay = 0;
    }

    // Factor 3: Engagement rate decline
    const engagementRate = performance?.engagement_rate || 0;
    const engagementBaseline = 3.0;
    if (engagementRate > 0 && engagementRate < engagementBaseline) {
      factors.engagement_decline = Math.min(1, (engagementBaseline - engagementRate) / engagementBaseline);
    } else {
      factors.engagement_decline = 0;
    }

    // Factor 4: Time in rotation (days since creation)
    const createdAt = new Date(creative.created_at);
    const now = new Date();
    const daysInRotation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    // 30 days = fully fatigued from time perspective
    factors.time_in_rotation = Math.min(1, daysInRotation / 30);

    // Weighted combination
    const weights: Record<string, number> = {
      impressions_volume: 0.25,
      ctr_decay: 0.30,
      engagement_decline: 0.25,
      time_in_rotation: 0.20,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    for (const [factor, value] of Object.entries(factors)) {
      const weight = weights[factor] || 1;
      weightedSum += value * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 100) / 100
      : 0;

    let recommendation: string;
    if (score >= FATIGUE_RETIREMENT_THRESHOLD) {
      recommendation = 'Creative is fatigued. Recommend immediate rotation with fresh variants.';
    } else if (score >= 0.4) {
      recommendation = 'Creative showing early fatigue signs. Plan replacement variants within 1-2 weeks.';
    } else {
      recommendation = 'Creative is performing well. Continue running and monitor metrics.';
    }

    const fatigueScore: FatigueScore = { score, factors, recommendation };

    // Cache the result
    await cacheSet(`${FATIGUE_CACHE_PREFIX}${creativeId}`, fatigueScore, CACHE_TTL_SECONDS);

    return fatigueScore;
  }

  /**
   * Suggests a creative rotation strategy for a campaign based on fatigue
   * scores and performance data of all active creatives in that campaign.
   */
  async suggestCreativeRotation(campaignId: string): Promise<RotationSuggestion> {
    this.log.info('Suggesting creative rotation', { campaignId });

    // Fetch all active creatives for the campaign
    const result = await pool.query(
      `SELECT id, name, fatigue_score, performance, is_active, created_at
       FROM creatives
       WHERE campaign_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [campaignId],
    );

    const creatives = result.rows;

    if (creatives.length === 0) {
      return {
        retire: [],
        keep: [],
        newCreativesNeeded: 3,
        reasoning: 'No active creatives found for this campaign. At least 3 new creatives are recommended for an effective rotation.',
      };
    }

    const retire: string[] = [];
    const keep: string[] = [];

    for (const creative of creatives) {
      const fatigue = await this.calculateFatigueScore(creative.id);
      if (fatigue.score >= FATIGUE_RETIREMENT_THRESHOLD) {
        retire.push(creative.id);
      } else {
        keep.push(creative.id);
      }
    }

    // Determine how many new creatives are needed
    // Aim for at least 3 active creatives in rotation at any time
    const minActiveCreatives = 3;
    const activeAfterRetirement = keep.length;
    const newCreativesNeeded = Math.max(0, minActiveCreatives - activeAfterRetirement);

    const reasoning = [
      `Analyzed ${creatives.length} active creative(s) for campaign "${campaignId}".`,
      `${retire.length} creative(s) have fatigue scores above ${FATIGUE_RETIREMENT_THRESHOLD} and should be retired.`,
      `${keep.length} creative(s) remain healthy.`,
      newCreativesNeeded > 0
        ? `${newCreativesNeeded} new creative(s) needed to maintain minimum rotation of ${minActiveCreatives}.`
        : 'Current rotation is healthy.',
    ].join(' ');

    return { retire, keep, newCreativesNeeded, reasoning };
  }

  /**
   * Generates text variations of a base creative using AI.
   * Useful for rapid A/B test variant creation.
   *
   * @param baseCreative - The original creative text to derive variations from.
   * @param count - Number of variations to generate.
   * @returns An array of variation strings.
   */
  async generateVariations(baseCreative: string, count: number): Promise<string[]> {
    this.log.info('Generating creative variations', { baseLength: baseCreative.length, count });

    const safeCount = Math.max(1, Math.min(count, 10));

    const userPrompt = JSON.stringify({
      task: 'generate_variations',
      baseCreative,
      count: safeCount,
      instructions: `Generate exactly ${safeCount} variations of the provided creative text. Each variation should take a different angle or emphasis while preserving the core message. Return a JSON array of strings.`,
    });

    const aiResponse = await this.callAI(this.getSystemPrompt(), userPrompt);
    const parsed = this.parseAIResponse<string[]>(aiResponse);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, safeCount);
    }

    this.log.warn('Failed to parse AI response for variations');
    return [];
  }

  /**
   * Assesses the performance of a creative by computing derived metrics
   * and comparing against campaign and platform benchmarks.
   */
  async assessCreativePerformance(creativeId: string): Promise<CreativePerformance> {
    this.log.info('Assessing creative performance', { creativeId });

    // Check cache
    const cached = await cacheGet<CreativePerformance>(`${PERFORMANCE_CACHE_PREFIX}${creativeId}`);
    if (cached) {
      this.log.debug('Returning cached creative performance', { creativeId });
      return cached;
    }

    const result = await pool.query(
      `SELECT id, performance FROM creatives WHERE id = $1`,
      [creativeId],
    );

    const creative = result.rows[0];
    if (!creative) {
      this.log.warn('Creative not found for performance assessment', { creativeId });
      return {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        engagement_rate: 0,
      };
    }

    const rawPerformance: Partial<CreativePerformance> =
      typeof creative.performance === 'string'
        ? JSON.parse(creative.performance)
        : creative.performance || {};

    const impressions = rawPerformance.impressions || 0;
    const clicks = rawPerformance.clicks || 0;
    const conversions = rawPerformance.conversions || 0;

    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
    const engagementRate = impressions > 0
      ? Math.round(((clicks + conversions) / impressions) * 10000) / 100
      : 0;

    const performance: CreativePerformance = {
      impressions,
      clicks,
      conversions,
      ctr,
      engagement_rate: engagementRate,
    };

    // Cache the result
    await cacheSet(`${PERFORMANCE_CACHE_PREFIX}${creativeId}`, performance, CACHE_TTL_SECONDS);

    return performance;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Attempts to parse a JSON string from an AI response.
   * Handles cases where the AI wraps the JSON in markdown code fences.
   */
  private parseAIResponse<T>(response: string): T | null {
    if (!response) {
      return null;
    }

    // Strip markdown code fences if present
    let cleaned = response.trim();
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      this.log.warn('Failed to parse AI response as JSON', {
        responsePreview: cleaned.substring(0, 200),
      });
      return null;
    }
  }
}

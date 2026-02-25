// ============================================================
// AI International Growth Engine - Brand Consistency Agent
// Agent 16: Brand Consistency & Compliance
//
// Validates tone alignment, messaging consistency, visual guideline
// compliance, and campaign alignment across all content and creative
// assets. Detects tone drift over time and generates compliance
// reports with actionable improvement recommendations.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput, AgentConfidenceScore } from '../base/types';
import type { AgentType, DateRange } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId, retryWithBackoff } from '../../utils/helpers';

// ---- Cache Configuration ----

/** Cache key prefix for brand consistency data */
const CACHE_PREFIX = 'brand_consistency';

/** Cache TTL in seconds (10 minutes) */
const CACHE_TTL = 600;

// ---- Score Thresholds ----

/** Minimum alignment score considered acceptable */
const ACCEPTABLE_ALIGNMENT_THRESHOLD = 70;

/** Score below which content is flagged for mandatory revision */
const MANDATORY_REVISION_THRESHOLD = 40;

/** Tone drift magnitude threshold that triggers a warning */
const TONE_DRIFT_WARNING_THRESHOLD = 0.3;

// ---- Local Type Definitions ----

/**
 * Result of analyzing the tone of a piece of content against brand guidelines.
 */
export interface ToneAnalysis {
  /** The content that was analyzed */
  content: string;
  /** The tone detected in the content */
  detectedTone: string;
  /** The expected brand tone */
  brandTone: string;
  /** Alignment score between detected and brand tone (0-100) */
  alignment: number;
  /** Specific tone issues found */
  issues: ToneIssue[];
  /** Actionable suggestions for improving tone alignment */
  suggestions: string[];
}

/**
 * A specific tone deviation identified in content.
 */
export interface ToneIssue {
  /** Type of tone issue (e.g. 'formality_mismatch', 'sentiment_deviation') */
  type: string;
  /** Location in the content where the issue was detected */
  location: string;
  /** Expected tone characteristic */
  expected: string;
  /** Tone characteristic actually found */
  found: string;
  /** Severity of the issue */
  severity: string;
}

/**
 * Result of validating messaging alignment for a campaign.
 */
export interface MessagingValidation {
  /** The campaign evaluated */
  campaignId: string;
  /** Whether the campaign messaging is aligned with brand guidelines */
  aligned: boolean;
  /** Overall messaging alignment score (0-100) */
  score: number;
  /** Specific deviations from brand messaging guidelines */
  deviations: string[];
  /** Recommendations for improving alignment */
  recommendations: string[];
}

/**
 * Result of checking visual consistency for a creative asset.
 */
export interface VisualConsistencyCheck {
  /** The creative asset evaluated */
  creativeId: string;
  /** Color palette compliance score (0-100) */
  colorCompliance: number;
  /** Typography guideline compliance score (0-100) */
  typographyCompliance: number;
  /** Whether the logo is used correctly */
  logoUsage: boolean;
  /** Overall visual consistency score (0-100) */
  overallScore: number;
  /** Specific visual issues identified */
  issues: string[];
}

/**
 * Holistic campaign alignment result combining messaging, visual, and tone scores.
 */
export interface CampaignAlignmentResult {
  /** The campaign evaluated */
  campaignId: string;
  /** Messaging alignment score (0-100) */
  messagingScore: number;
  /** Visual consistency score (0-100) */
  visualScore: number;
  /** Tone alignment score (0-100) */
  toneScore: number;
  /** Weighted overall alignment score (0-100) */
  overallScore: number;
  /** Identified alignment issues */
  issues: string[];
}

/**
 * The full set of brand guidelines used for consistency evaluation.
 */
export interface BrandGuidelineSet {
  /** Primary brand tone descriptor (e.g. 'professional', 'friendly', 'authoritative') */
  tone: string;
  /** Brand voice attributes (e.g. ['clear', 'confident', 'empathetic']) */
  voice: string[];
  /** Approved brand color codes (e.g. ['#1A73E8', '#FFFFFF', '#202124']) */
  colors: string[];
  /** Typography guidelines (e.g. 'Google Sans for headers, Roboto for body') */
  typography: string;
  /** Prohibited actions and phrases */
  doNots: string[];
  /** Example content snippets that exemplify the brand voice */
  examples: string[];
}

/**
 * Dimensional consistency scoring breakdown.
 */
export interface ConsistencyScore {
  /** Weighted overall consistency score (0-100) */
  overall: number;
  /** Tone consistency score (0-100) */
  tone: number;
  /** Visual consistency score (0-100) */
  visual: number;
  /** Messaging consistency score (0-100) */
  messaging: number;
  /** Breakdown by additional dimensions */
  byDimension: Record<string, number>;
}

/**
 * Periodic brand compliance report aggregating campaign scores and trends.
 */
export interface BrandComplianceReport {
  /** The period covered (e.g. '2026-01-01 to 2026-01-31') */
  period: string;
  /** Average compliance score across all campaigns */
  avgScore: number;
  /** Per-campaign compliance scores */
  campaigns: { id: string; score: number }[];
  /** Most frequently occurring compliance issues */
  topIssues: string[];
  /** Observed trends in compliance over the period */
  trends: string[];
}

/**
 * Result of detecting tone drift across a set of content pieces.
 */
export interface ToneDriftResult {
  /** Whether tone drift was detected */
  drifting: boolean;
  /** Direction of the drift (e.g. 'more_formal', 'less_empathetic', 'none') */
  driftDirection: string;
  /** Magnitude of the drift (0-1 scale) */
  magnitude: number;
  /** Content IDs exhibiting drift */
  affectedContent: string[];
}

// ---- Agent Implementation ----

/**
 * Brand Consistency Agent (Agent 16).
 *
 * Ensures all marketing content, creative assets, and campaign messaging
 * conform to established brand guidelines. Uses AI-powered tone analysis
 * with the Opus model for nuanced linguistic evaluation and combines it
 * with rule-based checks for visual elements like color palettes, typography,
 * and logo usage.
 *
 * The agent monitors for tone drift over time, validates messaging alignment
 * per campaign, and generates periodic compliance reports to support
 * brand governance at scale across international markets.
 *
 * @extends BaseAgent
 */
export class BrandConsistencyAgent extends BaseAgent {
  constructor(config?: Partial<{
    maxRetries: number;
    timeoutMs: number;
    confidenceThreshold: number;
  }>) {
    super({
      agentType: 'brand_consistency' as AgentType,
      model: 'opus',
      maxRetries: config?.maxRetries ?? 3,
      timeoutMs: config?.timeoutMs ?? 120_000,
      confidenceThreshold: config?.confidenceThreshold ?? 60,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the Claude system prompt for brand consistency analysis.
   * Uses Opus for its superior ability to detect tone nuances.
   */
  public getSystemPrompt(): string {
    return `You are the Brand Consistency Agent for an AI-powered international growth engine.
Your role is to evaluate marketing content, creative assets, and campaign messaging for
adherence to brand guidelines. You excel at detecting subtle tone deviations, messaging
inconsistencies, and brand voice drift.

You will be provided with:
- Content to analyze (ad copy, blog posts, creative scripts)
- Brand guidelines (tone, voice attributes, visual standards, do-nots)
- Historical content samples for drift comparison

Your responsibilities:
1. Analyze content tone and compare it to the defined brand tone.
2. Identify specific tone issues with their location and severity.
3. Validate messaging alignment against campaign and brand goals.
4. Detect tone drift by comparing content chronologically.
5. Provide actionable suggestions for improving brand alignment.
6. Assign confidence levels reflecting the quality of your analysis.
7. Flag areas of uncertainty when guidelines are ambiguous or content is insufficient.

Output format: Respond with valid JSON matching the requested schema. Be specific about
tone deviations and provide concrete examples. Do not fabricate issues — only flag genuine
deviations from the provided guidelines.`;
  }

  /**
   * Returns the agent types whose decisions this agent can challenge.
   * Brand Consistency can challenge creative generation, content/blog,
   * and localization agents since they produce brand-facing content.
   */
  public getChallengeTargets(): AgentType[] {
    return ['creative_generation', 'content_blog', 'localization'];
  }

  /**
   * Core processing method. Evaluates brand consistency across the specified
   * campaign or content, validating tone, messaging, and visual alignment.
   *
   * @param input - Standard agent input. Expected context keys:
   *   - `campaignId` (optional): specific campaign to evaluate
   *   - `content` (optional): raw content string to analyze
   *   - `creativeId` (optional): specific creative to check visually
   *   - `mode` (optional): 'full_audit' | 'tone_only' | 'visual_only'
   * @returns Structured agent output with brand consistency assessment.
   */
  public async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Starting brand consistency analysis', {
      requestId: input.requestId,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];

    const campaignId = input.context.campaignId as string | undefined;
    const content = input.context.content as string | undefined;
    const creativeId = input.context.creativeId as string | undefined;
    const mode = (input.context.mode as string) ?? 'full_audit';

    // Fetch brand guidelines
    let guidelines: BrandGuidelineSet;
    try {
      guidelines = await this.getBrandGuidelines();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to load brand guidelines: ${message}`);
      uncertainties.push(
        this.flagUncertainty('guidelines', 'Brand guidelines unavailable — analysis accuracy reduced'),
      );

      const output = this.buildOutput(
        'guidelines_unavailable',
        {},
        this.calculateConfidence({ guidelinesAvailability: 0 }),
        'Could not load brand guidelines. Analysis cannot proceed without baseline guidelines.',
        ['Configure brand guidelines before running brand consistency checks.'],
        warnings,
        uncertainties,
      );
      await this.logDecision(input, output);
      return output;
    }

    const analysisResults: Record<string, unknown> = {};

    // Tone analysis
    if (content && (mode === 'full_audit' || mode === 'tone_only')) {
      try {
        const toneResult = await this.analyzeTone(content);
        analysisResults.toneAnalysis = toneResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Tone analysis failed: ${message}`);
        uncertainties.push(
          this.flagUncertainty('tone', 'Tone analysis could not be completed'),
        );
      }
    }

    // Messaging validation
    if (campaignId && (mode === 'full_audit' || mode === 'tone_only')) {
      try {
        const messagingResult = await this.validateMessagingAlignment(campaignId);
        analysisResults.messagingValidation = messagingResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Messaging validation failed: ${message}`);
      }
    }

    // Visual consistency check
    if (creativeId && (mode === 'full_audit' || mode === 'visual_only')) {
      try {
        const visualResult = await this.checkVisualConsistency(creativeId);
        analysisResults.visualConsistency = visualResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Visual consistency check failed: ${message}`);
      }
    }

    // Campaign alignment (when campaignId is provided)
    if (campaignId && mode === 'full_audit') {
      try {
        const alignmentResult = await this.validateCampaignAlignment(campaignId);
        analysisResults.campaignAlignment = alignmentResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Campaign alignment validation failed: ${message}`);
      }
    }

    // Overall consistency score
    let consistencyScore: ConsistencyScore | undefined;
    if (campaignId) {
      try {
        consistencyScore = await this.scoreOverallConsistency(campaignId);
        analysisResults.consistencyScore = consistencyScore;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Consistency scoring failed: ${message}`);
      }
    }

    // Calculate confidence
    const analysisCount = Object.keys(analysisResults).length;
    const expectedAnalyses = mode === 'full_audit' ? 4 : 1;
    const analysisCompleteness = Math.min(100, (analysisCount / expectedAnalyses) * 100);

    const confidence = this.calculateConfidence({
      guidelinesAvailability: 90, // We have guidelines if we reached this point
      analysisCompleteness,
      aiModelQuality: 85, // Opus model used for tone analysis
      dataAvailability: analysisCount > 0 ? 75 : 20,
    });

    // Generate recommendations
    const recommendations: string[] = [];
    const toneAnalysis = analysisResults.toneAnalysis as ToneAnalysis | undefined;
    if (toneAnalysis && toneAnalysis.alignment < ACCEPTABLE_ALIGNMENT_THRESHOLD) {
      recommendations.push(
        `Tone alignment score of ${toneAnalysis.alignment}/100 is below acceptable threshold. Review and revise content tone.`,
      );
    }
    const messagingVal = analysisResults.messagingValidation as MessagingValidation | undefined;
    if (messagingVal && !messagingVal.aligned) {
      const deviationCount = messagingVal.deviations?.length ?? 0;
      recommendations.push(
        `Campaign messaging deviates from brand guidelines. Address ${deviationCount} deviation(s).`,
      );
    }
    const visualCheck = analysisResults.visualConsistency as VisualConsistencyCheck | undefined;
    if (visualCheck && visualCheck.overallScore < ACCEPTABLE_ALIGNMENT_THRESHOLD) {
      recommendations.push(
        `Visual consistency score of ${visualCheck.overallScore}/100 needs improvement. Review ${visualCheck.issues.length} issue(s).`,
      );
    }
    if (recommendations.length === 0 && analysisCount > 0) {
      recommendations.push('Brand consistency checks passed. Continue monitoring for drift.');
    }

    // Cache results
    try {
      await cacheSet(
        `${CACHE_PREFIX}:analysis:${input.requestId}`,
        analysisResults,
        CACHE_TTL,
      );
      await cacheSet(`${CACHE_PREFIX}:analysis:latest`, analysisResults, CACHE_TTL);
    } catch (error) {
      this.log.warn('Failed to cache brand consistency results', { error });
    }

    // Persist state
    await this.persistState({
      lastAnalysis: new Date().toISOString(),
      mode,
      analysisCount,
      overallScore: consistencyScore?.overall ?? null,
    });

    const overallScore = consistencyScore?.overall;
    const scoreSummary = overallScore !== undefined
      ? `Overall consistency score: ${overallScore}/100.`
      : 'Overall score unavailable.';

    const output = this.buildOutput(
      'brand_consistency_analysis_complete',
      analysisResults,
      confidence,
      `Brand consistency analysis complete (mode: ${mode}). ${analysisCount} check(s) performed. ${scoreSummary}`,
      recommendations,
      warnings,
      uncertainties,
    );

    await this.logDecision(input, output);

    this.log.info('Brand consistency analysis complete', {
      requestId: input.requestId,
      mode,
      analysisCount,
      overallScore,
      confidence: confidence.score,
    });

    return output;
  }

  // ------------------------------------------------------------------
  // Public analysis methods
  // ------------------------------------------------------------------

  /**
   * Analyzes the tone of a content string against brand guidelines using
   * the Opus AI model for nuanced linguistic evaluation.
   *
   * @param content - The text content to analyze.
   * @returns Tone analysis with alignment score, issues, and suggestions.
   */
  public async analyzeTone(content: string): Promise<ToneAnalysis> {
    this.log.info('Analyzing content tone', { contentLength: content.length });

    const guidelines = await this.getBrandGuidelines();

    let analysis: ToneAnalysis;

    try {
      const systemPrompt = this.getSystemPrompt();
      const userPrompt = `Analyze the tone of the following content against our brand guidelines.

Brand Tone: ${guidelines.tone}
Brand Voice Attributes: ${guidelines.voice.join(', ')}
Do-Nots: ${guidelines.doNots.join(', ')}

Content to analyze:
"""
${content}
"""

Respond with JSON matching this exact schema:
{
  "detectedTone": "string describing the detected tone",
  "alignment": number (0-100),
  "issues": [
    {
      "type": "string (e.g. formality_mismatch, sentiment_deviation, voice_inconsistency)",
      "location": "string (excerpt or position description)",
      "expected": "string",
      "found": "string",
      "severity": "low | medium | high"
    }
  ],
  "suggestions": ["string"]
}`;

      const response = await retryWithBackoff(
        () => this.callAI(systemPrompt, userPrompt),
        this.config.maxRetries,
        1000,
      );

      const parsed = JSON.parse(response);

      analysis = {
        content,
        detectedTone: parsed.detectedTone ?? 'unknown',
        brandTone: guidelines.tone,
        alignment: typeof parsed.alignment === 'number'
          ? Math.max(0, Math.min(100, parsed.alignment))
          : 50,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch (error) {
      this.log.warn('AI tone analysis failed, using rule-based fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      analysis = this.performRuleBasedToneAnalysis(content, guidelines);
    }

    this.log.info('Tone analysis complete', {
      detectedTone: analysis.detectedTone,
      alignment: analysis.alignment,
      issueCount: analysis.issues.length,
    });

    return analysis;
  }

  /**
   * Validates messaging alignment for a specific campaign by comparing
   * campaign content against brand messaging guidelines.
   *
   * @param campaignId - The campaign to validate.
   * @returns Messaging validation result.
   */
  public async validateMessagingAlignment(campaignId: string): Promise<MessagingValidation> {
    this.log.info('Validating messaging alignment', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:messaging:${campaignId}`;
    const cached = await cacheGet<MessagingValidation>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch campaign and its creative content
    const campaignContent = await this.fetchCampaignContent(campaignId);
    const guidelines = await this.getBrandGuidelines();

    if (campaignContent.length === 0) {
      return {
        campaignId,
        aligned: true,
        score: 0,
        deviations: [],
        recommendations: ['No content found for this campaign. Unable to validate messaging.'],
      };
    }

    const deviations: string[] = [];
    let totalScore = 0;

    for (const contentItem of campaignContent) {
      const text = contentItem.content as string;
      if (!text) continue;

      // Check for do-not violations
      for (const doNot of guidelines.doNots) {
        if (text.toLowerCase().includes(doNot.toLowerCase())) {
          deviations.push(
            `Content "${(contentItem.name as string) ?? contentItem.id}" contains prohibited phrase: "${doNot}"`,
          );
        }
      }

      // Perform tone check
      try {
        const toneResult = await this.analyzeTone(text);
        totalScore += toneResult.alignment;
      } catch {
        totalScore += 50; // Neutral score on failure
      }
    }

    const avgScore = campaignContent.length > 0
      ? Math.round((totalScore / campaignContent.length) * 100) / 100
      : 0;

    const aligned = avgScore >= ACCEPTABLE_ALIGNMENT_THRESHOLD && deviations.length === 0;

    const recommendations: string[] = [];
    if (!aligned) {
      if (avgScore < MANDATORY_REVISION_THRESHOLD) {
        recommendations.push('Mandatory revision required — messaging significantly deviates from brand guidelines.');
      } else if (avgScore < ACCEPTABLE_ALIGNMENT_THRESHOLD) {
        recommendations.push('Review and adjust messaging to better align with brand voice and tone guidelines.');
      }
      if (deviations.length > 0) {
        recommendations.push(`Address ${deviations.length} messaging deviation(s) violating brand do-nots.`);
      }
    }

    const result: MessagingValidation = {
      campaignId,
      aligned,
      score: avgScore,
      deviations,
      recommendations,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Messaging alignment validation complete', {
      campaignId,
      aligned,
      score: avgScore,
      deviationCount: deviations.length,
    });

    return result;
  }

  /**
   * Checks visual consistency of a creative asset against brand guidelines,
   * including color palette compliance, typography, and logo usage.
   *
   * @param creativeId - The creative asset to check.
   * @returns Visual consistency check result.
   */
  public async checkVisualConsistency(creativeId: string): Promise<VisualConsistencyCheck> {
    this.log.info('Checking visual consistency', { creativeId });

    const cacheKey = `${CACHE_PREFIX}:visual:${creativeId}`;
    const cached = await cacheGet<VisualConsistencyCheck>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch creative metadata
    const creative = await this.fetchCreativeDetails(creativeId);
    const guidelines = await this.getBrandGuidelines();

    if (!creative) {
      return {
        creativeId,
        colorCompliance: 0,
        typographyCompliance: 0,
        logoUsage: false,
        overallScore: 0,
        issues: ['Creative asset not found'],
      };
    }

    const issues: string[] = [];

    // Check color compliance from creative metadata
    const usedColors = (creative.metadata?.colors as string[]) ?? [];
    let colorCompliance = 100;
    if (usedColors.length > 0 && guidelines.colors.length > 0) {
      const approvedColors = guidelines.colors.map((c) => c.toLowerCase());
      const nonCompliantColors = usedColors.filter(
        (c) => !approvedColors.includes(c.toLowerCase()),
      );
      if (nonCompliantColors.length > 0) {
        colorCompliance = Math.max(
          0,
          Math.round(((usedColors.length - nonCompliantColors.length) / usedColors.length) * 100),
        );
        issues.push(`Non-approved colors detected: ${nonCompliantColors.join(', ')}`);
      }
    } else if (usedColors.length === 0) {
      colorCompliance = 50; // Cannot verify without color data
      issues.push('No color metadata available for verification');
    }

    // Check typography compliance
    const usedFonts = (creative.metadata?.fonts as string[]) ?? [];
    let typographyCompliance = 100;
    if (usedFonts.length > 0 && guidelines.typography) {
      const guidelineTypography = guidelines.typography.toLowerCase();
      const nonCompliantFonts = usedFonts.filter(
        (f) => !guidelineTypography.includes(f.toLowerCase()),
      );
      if (nonCompliantFonts.length > 0) {
        typographyCompliance = Math.max(
          0,
          Math.round(((usedFonts.length - nonCompliantFonts.length) / usedFonts.length) * 100),
        );
        issues.push(`Non-approved fonts detected: ${nonCompliantFonts.join(', ')}`);
      }
    } else if (usedFonts.length === 0) {
      typographyCompliance = 50; // Cannot verify without font data
      issues.push('No typography metadata available for verification');
    }

    // Check logo usage
    const logoPresent = (creative.metadata?.logo_present as boolean) ?? false;
    const logoCorrectPlacement = (creative.metadata?.logo_correct_placement as boolean) ?? false;
    const logoUsage = logoPresent && logoCorrectPlacement;
    if (!logoPresent) {
      issues.push('Brand logo not detected in creative');
    } else if (!logoCorrectPlacement) {
      issues.push('Brand logo placement does not follow guidelines');
    }

    // Calculate overall score (weighted)
    const overallScore = Math.round(
      (colorCompliance * 0.35 + typographyCompliance * 0.30 + (logoUsage ? 100 : 0) * 0.35) * 100
    ) / 100;

    const result: VisualConsistencyCheck = {
      creativeId,
      colorCompliance,
      typographyCompliance,
      logoUsage,
      overallScore,
      issues,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Visual consistency check complete', {
      creativeId,
      overallScore,
      issueCount: issues.length,
    });

    return result;
  }

  /**
   * Validates overall campaign alignment across messaging, visual, and tone dimensions.
   *
   * @param campaignId - The campaign to validate.
   * @returns Campaign alignment result with dimensional scores.
   */
  public async validateCampaignAlignment(campaignId: string): Promise<CampaignAlignmentResult> {
    this.log.info('Validating campaign alignment', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:campaign_alignment:${campaignId}`;
    const cached = await cacheGet<CampaignAlignmentResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const issues: string[] = [];

    // Messaging score
    let messagingScore = 0;
    try {
      const messagingResult = await this.validateMessagingAlignment(campaignId);
      messagingScore = messagingResult.score;
      if (!messagingResult.aligned) {
        issues.push(...messagingResult.deviations.slice(0, 5)); // Limit to top 5
      }
    } catch (error) {
      issues.push('Could not evaluate messaging alignment');
      messagingScore = 0;
    }

    // Visual score — average across campaign creatives
    let visualScore = 0;
    try {
      const creatives = await this.fetchCampaignCreativeIds(campaignId);
      if (creatives.length > 0) {
        let totalVisual = 0;
        for (const cId of creatives) {
          try {
            const visualResult = await this.checkVisualConsistency(cId);
            totalVisual += visualResult.overallScore;
            if (visualResult.issues.length > 0) {
              issues.push(...visualResult.issues.slice(0, 3));
            }
          } catch {
            // Skip individual failures
          }
        }
        visualScore = Math.round((totalVisual / creatives.length) * 100) / 100;
      }
    } catch {
      issues.push('Could not evaluate visual consistency');
    }

    // Tone score — average tone alignment across campaign content
    let toneScore = 0;
    try {
      const contentItems = await this.fetchCampaignContent(campaignId);
      if (contentItems.length > 0) {
        let totalTone = 0;
        for (const item of contentItems) {
          const text = item.content as string;
          if (!text) continue;
          try {
            const toneResult = await this.analyzeTone(text);
            totalTone += toneResult.alignment;
          } catch {
            totalTone += 50; // Neutral fallback
          }
        }
        toneScore = Math.round((totalTone / contentItems.length) * 100) / 100;
      }
    } catch {
      issues.push('Could not evaluate tone alignment');
    }

    // Overall score (weighted)
    const overallScore = Math.round(
      (messagingScore * 0.40 + visualScore * 0.30 + toneScore * 0.30) * 100,
    ) / 100;

    const result: CampaignAlignmentResult = {
      campaignId,
      messagingScore,
      visualScore,
      toneScore,
      overallScore,
      issues: [...new Set(issues)], // Deduplicate
    };

    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Campaign alignment validation complete', {
      campaignId,
      overallScore,
      messagingScore,
      visualScore,
      toneScore,
      issueCount: result.issues.length,
    });

    return result;
  }

  /**
   * Fetches brand guidelines from the database. Returns cached guidelines
   * when available.
   *
   * @returns The current brand guideline set.
   */
  public async getBrandGuidelines(): Promise<BrandGuidelineSet> {
    const cacheKey = `${CACHE_PREFIX}:guidelines`;
    const cached = await cacheGet<BrandGuidelineSet>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await pool.query(
        `SELECT tone, voice, colors, typography, do_nots, examples
         FROM brand_guidelines
         WHERE is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
      );

      if (result.rows.length === 0) {
        throw new Error('No active brand guidelines found in the database');
      }

      const row = result.rows[0];
      const guidelines: BrandGuidelineSet = {
        tone: row.tone as string,
        voice: (row.voice as string[]) ?? [],
        colors: (row.colors as string[]) ?? [],
        typography: (row.typography as string) ?? '',
        doNots: (row.do_nots as string[]) ?? [],
        examples: (row.examples as string[]) ?? [],
      };

      await cacheSet(cacheKey, guidelines, CACHE_TTL);
      return guidelines;
    } catch (error) {
      this.log.error('Failed to fetch brand guidelines', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculates an overall consistency score for a campaign across all dimensions.
   *
   * @param campaignId - The campaign to score.
   * @returns Dimensional consistency score breakdown.
   */
  public async scoreOverallConsistency(campaignId: string): Promise<ConsistencyScore> {
    this.log.info('Scoring overall consistency', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:consistency_score:${campaignId}`;
    const cached = await cacheGet<ConsistencyScore>(cacheKey);
    if (cached) {
      return cached;
    }

    const alignment = await this.validateCampaignAlignment(campaignId);

    const byDimension: Record<string, number> = {
      messaging: alignment.messagingScore,
      visual: alignment.visualScore,
      tone: alignment.toneScore,
    };

    const score: ConsistencyScore = {
      overall: alignment.overallScore,
      tone: alignment.toneScore,
      visual: alignment.visualScore,
      messaging: alignment.messagingScore,
      byDimension,
    };

    await cacheSet(cacheKey, score, CACHE_TTL);
    return score;
  }

  /**
   * Generates a brand compliance report for a given date range, aggregating
   * campaign scores and identifying top issues and trends.
   *
   * @param dateRange - Optional date range filter. Defaults to last 30 days.
   * @returns Brand compliance report.
   */
  public async generateComplianceReport(dateRange?: DateRange): Promise<BrandComplianceReport> {
    this.log.info('Generating brand compliance report', { dateRange });

    const now = new Date();
    const startDate = dateRange?.startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = dateRange?.endDate ?? now.toISOString();
    const period = `${startDate} to ${endDate}`;

    // Fetch campaigns in the date range
    let campaigns: { id: string; score: number }[] = [];
    try {
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM campaigns
         WHERE created_at >= $1 AND created_at <= $2
         ORDER BY created_at DESC`,
        [startDate, endDate],
      );

      for (const row of result.rows) {
        try {
          const consistency = await this.scoreOverallConsistency(row.id);
          campaigns.push({ id: row.id, score: consistency.overall });
        } catch {
          campaigns.push({ id: row.id, score: 0 });
        }
      }
    } catch (error) {
      this.log.warn('Failed to fetch campaigns for compliance report', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Calculate average score
    const avgScore = campaigns.length > 0
      ? Math.round((campaigns.reduce((sum, c) => sum + c.score, 0) / campaigns.length) * 100) / 100
      : 0;

    // Identify top issues by aggregating alignment checks
    const issueFrequency: Record<string, number> = {};
    for (const campaign of campaigns) {
      try {
        const alignment = await this.validateCampaignAlignment(campaign.id);
        for (const issue of alignment.issues) {
          issueFrequency[issue] = (issueFrequency[issue] ?? 0) + 1;
        }
      } catch {
        // Skip failed alignment checks
      }
    }

    const topIssues = Object.entries(issueFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([issue]) => issue);

    // Generate trend observations
    const trends: string[] = [];
    if (campaigns.length > 0) {
      const halfPoint = Math.floor(campaigns.length / 2);
      if (halfPoint > 0) {
        const firstHalfAvg = campaigns.slice(0, halfPoint).reduce((sum, c) => sum + c.score, 0) / halfPoint;
        const secondHalfAvg = campaigns.slice(halfPoint).reduce((sum, c) => sum + c.score, 0) / (campaigns.length - halfPoint);
        const diff = secondHalfAvg - firstHalfAvg;

        if (Math.abs(diff) > 5) {
          trends.push(
            diff > 0
              ? `Brand consistency improving: average score increased by ${diff.toFixed(1)} points in the latter half of the period.`
              : `Brand consistency declining: average score decreased by ${Math.abs(diff).toFixed(1)} points in the latter half of the period.`,
          );
        } else {
          trends.push('Brand consistency scores remain stable across the reporting period.');
        }
      }

      const lowScoreCampaigns = campaigns.filter((c) => c.score < MANDATORY_REVISION_THRESHOLD);
      if (lowScoreCampaigns.length > 0) {
        trends.push(
          `${lowScoreCampaigns.length} campaign(s) scored below the mandatory revision threshold of ${MANDATORY_REVISION_THRESHOLD}/100.`,
        );
      }
    }

    const report: BrandComplianceReport = {
      period,
      avgScore,
      campaigns,
      topIssues,
      trends,
    };

    this.log.info('Brand compliance report generated', {
      period,
      avgScore,
      campaignCount: campaigns.length,
      topIssueCount: topIssues.length,
    });

    return report;
  }

  /**
   * Detects tone drift across a set of content pieces by analyzing
   * chronological changes in tone alignment scores.
   *
   * @param contentIds - Array of content IDs to analyze, assumed in chronological order.
   * @returns Tone drift analysis result.
   */
  public async detectToneDrift(contentIds: string[]): Promise<ToneDriftResult> {
    this.log.info('Detecting tone drift', { contentCount: contentIds.length });

    if (contentIds.length < 2) {
      return {
        drifting: false,
        driftDirection: 'none',
        magnitude: 0,
        affectedContent: [],
      };
    }

    // Analyze tone for each content piece
    const toneScores: { id: string; alignment: number; detectedTone: string }[] = [];

    for (const cId of contentIds) {
      try {
        const contentText = await this.fetchContentText(cId);
        if (!contentText) continue;

        const toneResult = await this.analyzeTone(contentText);
        toneScores.push({
          id: cId,
          alignment: toneResult.alignment,
          detectedTone: toneResult.detectedTone,
        });
      } catch (error) {
        this.log.warn('Failed to analyze tone for content', {
          contentId: cId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (toneScores.length < 2) {
      return {
        drifting: false,
        driftDirection: 'none',
        magnitude: 0,
        affectedContent: [],
      };
    }

    // Detect drift by comparing first half to second half
    const halfPoint = Math.floor(toneScores.length / 2);
    const firstHalf = toneScores.slice(0, halfPoint);
    const secondHalf = toneScores.slice(halfPoint);

    const firstAvg = firstHalf.reduce((sum, s) => sum + s.alignment, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.alignment, 0) / secondHalf.length;

    const magnitude = Math.abs(secondAvg - firstAvg) / 100; // Normalize to 0-1
    const drifting = magnitude > TONE_DRIFT_WARNING_THRESHOLD;

    // Determine drift direction
    let driftDirection = 'none';
    if (drifting) {
      if (secondAvg < firstAvg) {
        driftDirection = 'away_from_brand'; // Declining alignment
      } else {
        driftDirection = 'toward_brand'; // Improving alignment
      }
    }

    // Identify affected content (those deviating most from brand tone)
    const guidelines = await this.getBrandGuidelines();
    const affectedContent = toneScores
      .filter((s) => s.alignment < ACCEPTABLE_ALIGNMENT_THRESHOLD)
      .map((s) => s.id);

    const result: ToneDriftResult = {
      drifting,
      driftDirection,
      magnitude: Math.round(magnitude * 1000) / 1000,
      affectedContent,
    };

    this.log.info('Tone drift detection complete', {
      drifting,
      driftDirection,
      magnitude: result.magnitude,
      affectedContentCount: affectedContent.length,
    });

    return result;
  }

  // ------------------------------------------------------------------
  // Private helper methods
  // ------------------------------------------------------------------

  /**
   * Performs a rule-based tone analysis fallback when AI is unavailable.
   */
  private performRuleBasedToneAnalysis(
    content: string,
    guidelines: BrandGuidelineSet,
  ): ToneAnalysis {
    const issues: ToneIssue[] = [];
    const suggestions: string[] = [];
    let alignment = 70; // Start with moderate alignment

    // Check for do-not violations
    for (const doNot of guidelines.doNots) {
      if (content.toLowerCase().includes(doNot.toLowerCase())) {
        issues.push({
          type: 'prohibited_content',
          location: `Contains "${doNot}"`,
          expected: `Avoid: "${doNot}"`,
          found: doNot,
          severity: 'high',
        });
        alignment -= 15;
        suggestions.push(`Remove or rephrase content containing "${doNot}".`);
      }
    }

    // Check for voice attribute presence (simple heuristic)
    const contentLower = content.toLowerCase();
    for (const voiceAttr of guidelines.voice) {
      // Simple presence check — not a full NLP analysis
      if (voiceAttr.toLowerCase() === 'formal' && /\b(gonna|wanna|kinda|lol|omg)\b/i.test(content)) {
        issues.push({
          type: 'formality_mismatch',
          location: 'Informal language detected',
          expected: 'formal',
          found: 'informal',
          severity: 'medium',
        });
        alignment -= 10;
        suggestions.push('Remove informal language to match the formal brand voice.');
      }
    }

    // Check content length (very short content is hard to evaluate)
    if (content.length < 20) {
      suggestions.push('Content is very short — tone analysis may be unreliable.');
    }

    alignment = Math.max(0, Math.min(100, alignment));

    return {
      content,
      detectedTone: 'unknown (rule-based analysis)',
      brandTone: guidelines.tone,
      alignment,
      issues,
      suggestions,
    };
  }

  /**
   * Fetches all creative content for a campaign.
   */
  private async fetchCampaignContent(campaignId: string): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        `SELECT id, name, type, content, media_urls, fatigue_score, is_active, created_at
         FROM creatives
         WHERE campaign_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [campaignId],
      );
      return result.rows as Record<string, unknown>[];
    } catch (error) {
      this.log.warn('Failed to fetch campaign content', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Fetches creative IDs associated with a campaign.
   */
  private async fetchCampaignCreativeIds(campaignId: string): Promise<string[]> {
    try {
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM creatives WHERE campaign_id = $1 AND is_active = true`,
        [campaignId],
      );
      return result.rows.map((r) => r.id);
    } catch (error) {
      this.log.warn('Failed to fetch campaign creative IDs', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Fetches detailed creative metadata including visual attributes.
   */
  private async fetchCreativeDetails(
    creativeId: string,
  ): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
    try {
      const result = await pool.query(
        `SELECT id, name, type, content, media_urls,
                COALESCE(metadata, '{}'::jsonb) AS metadata
         FROM creatives
         WHERE id = $1`,
        [creativeId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id as string,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
      };
    } catch (error) {
      this.log.warn('Failed to fetch creative details', {
        creativeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetches the text content for a specific content ID.
   */
  private async fetchContentText(contentId: string): Promise<string | null> {
    try {
      const result = await pool.query<{ content: string }>(
        `SELECT content FROM creatives WHERE id = $1
         UNION ALL
         SELECT body AS content FROM content WHERE id = $1
         LIMIT 1`,
        [contentId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].content;
    } catch (error) {
      this.log.warn('Failed to fetch content text', {
        contentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

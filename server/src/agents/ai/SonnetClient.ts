// ============================================================
// AI Integration Layer - Sonnet Client
// Phase 3B: Model-specific client for Claude Sonnet
// ============================================================

import { env } from '../../config/env';
import { createChildLogger } from '../../utils/logger';
import { AnthropicClient } from './AnthropicClient';
import type { AIRequest, AIResponse } from './types';

/**
 * Sonnet-specific client for routine and high-throughput AI tasks.
 *
 * Wraps the base AnthropicClient with Sonnet-specific defaults:
 * - Standard token limit (2048) for efficient responses
 * - Moderate temperature (0.7) for creative yet coherent outputs
 * - Automatically routes all requests to the Sonnet model
 *
 * **Use cases:** content generation, translations, cultural adaptations,
 * auxiliary analysis, ad copy, blog content, compliance checks.
 */
export class SonnetClient extends AnthropicClient {
  private readonly sonnetLog;

  /**
   * Creates a new SonnetClient instance.
   *
   * @param apiKey - Optional Anthropic API key override. Falls back to env.ANTHROPIC_API_KEY.
   */
  constructor(apiKey?: string) {
    super(apiKey);

    // Sonnet-specific defaults: standard token limit for efficient outputs
    this.defaultMaxTokens = 2048;
    this.defaultTemperature = 0.7;

    this.sonnetLog = createChildLogger({
      component: 'SonnetClient',
      model: env.ANTHROPIC_SONNET_MODEL,
    });

    this.sonnetLog.info('SonnetClient initialized', {
      model: env.ANTHROPIC_SONNET_MODEL,
      defaultMaxTokens: this.defaultMaxTokens,
      defaultTemperature: this.defaultTemperature,
    });
  }

  /**
   * Sends a message using the Sonnet model.
   *
   * Overrides the model field in the request to always use 'sonnet', regardless
   * of what was originally specified.
   *
   * @param request - The AI request. The `model` field is forced to 'sonnet'.
   * @returns A structured AIResponse from the Sonnet model.
   */
  async sendMessage(request: AIRequest): Promise<AIResponse> {
    const sonnetRequest: AIRequest = {
      ...request,
      model: 'sonnet',
    };

    this.sonnetLog.debug('Routing request through Sonnet', {
      maxTokens: request.maxTokens ?? this.defaultMaxTokens,
      temperature: request.temperature ?? this.defaultTemperature,
      metadata: request.metadata,
    });

    return super.sendMessage(sonnetRequest);
  }

  /**
   * Generates content using the Sonnet model.
   *
   * Convenience method for content generation tasks like ad copy, blog posts,
   * product descriptions, and social media content.
   *
   * @param systemPrompt - The system prompt setting the content generation context.
   * @param userPrompt - The user prompt describing the content to generate.
   * @param metadata - Optional metadata for tracking and logging.
   * @returns A structured AIResponse containing the generated content.
   */
  async generateContent(
    systemPrompt: string,
    userPrompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<AIResponse> {
    return this.sendMessage({
      model: 'sonnet',
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.8,
      metadata: { ...metadata, taskType: 'content_generation' },
    });
  }

  /**
   * Translates and culturally adapts content using the Sonnet model.
   *
   * Convenience method for localization tasks where the model translates
   * content while applying cultural adaptations for the target market.
   *
   * @param systemPrompt - The system prompt with translation/localization instructions.
   * @param userPrompt - The user prompt containing the source content and target language.
   * @param metadata - Optional metadata for tracking and logging.
   * @returns A structured AIResponse containing the translated content.
   */
  async translate(
    systemPrompt: string,
    userPrompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<AIResponse> {
    return this.sendMessage({
      model: 'sonnet',
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
      metadata: { ...metadata, taskType: 'translation' },
    });
  }

  /**
   * Performs auxiliary analysis tasks using the Sonnet model.
   *
   * Convenience method for lightweight analysis tasks like compliance
   * checking, sentiment analysis, or data classification.
   *
   * @param systemPrompt - The system prompt setting the analysis context.
   * @param userPrompt - The user prompt with the data/content to analyze.
   * @param metadata - Optional metadata for tracking and logging.
   * @returns A structured AIResponse containing the analysis results.
   */
  async analyze(
    systemPrompt: string,
    userPrompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<AIResponse> {
    return this.sendMessage({
      model: 'sonnet',
      systemPrompt,
      userPrompt,
      maxTokens: 1024,
      temperature: 0.2,
      metadata: { ...metadata, taskType: 'analysis' },
    });
  }
}

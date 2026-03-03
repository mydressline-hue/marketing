// ============================================================
// AI Integration Layer - Anthropic Client
// Phase 3B: Core wrapper around the Anthropic SDK
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { createChildLogger } from '../../utils/logger';
import { ExternalServiceError } from '../../utils/errors';
import { generateId } from '../../utils/helpers';
import { retryWithBackoff } from '../../utils/helpers';
import type { AIRequest, AIResponse, TokenUsage } from './types';

const SERVICE_NAME = 'anthropic-api';

/**
 * Core client that wraps the Anthropic SDK, providing:
 * - Message sending with system/user prompts
 * - Automatic retry with exponential backoff
 * - Token usage and latency tracking
 * - Structured error handling
 *
 * This class is used directly or extended by model-specific clients
 * (OpusClient, SonnetClient).
 */
export class AnthropicClient {
  protected readonly client: Anthropic;
  protected readonly log;

  /** Default max tokens if not specified in the request. */
  protected defaultMaxTokens: number = 2048;

  /** Default temperature if not specified in the request. */
  protected defaultTemperature: number = 0.7;

  /** Maximum number of retry attempts for transient failures. */
  protected maxRetries: number = 3;

  /** Base delay in ms for exponential backoff between retries. */
  protected baseRetryDelay: number = 1000;

  /**
   * Creates a new AnthropicClient instance.
   *
   * @param apiKey - Anthropic API key. Falls back to env.ANTHROPIC_API_KEY.
   * @throws ExternalServiceError if no API key is available.
   */
  constructor(apiKey?: string) {
    const key = apiKey ?? env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new ExternalServiceError(
        SERVICE_NAME,
        'Anthropic API key is not configured. Set ANTHROPIC_API_KEY in environment.',
      );
    }

    this.client = new Anthropic({ apiKey: key });
    this.log = createChildLogger({ component: 'AnthropicClient' });
  }

  /**
   * Sends a message to the Anthropic API and returns a structured response.
   *
   * Wraps the call with retry logic, latency measurement, and token usage tracking.
   *
   * @param request - The AI request containing model, prompts, and options.
   * @returns A structured AIResponse with content, usage, and metadata.
   * @throws ExternalServiceError if the API call fails after all retries.
   */
  async sendMessage(request: AIRequest): Promise<AIResponse> {
    const requestId = generateId();
    const modelId = this.resolveModelId(request.model);
    const maxTokens = request.maxTokens ?? this.defaultMaxTokens;
    const temperature = request.temperature ?? this.defaultTemperature;

    this.log.info('Sending AI request', {
      requestId,
      model: modelId,
      maxTokens,
      temperature,
      systemPromptLength: request.systemPrompt.length,
      userPromptLength: request.userPrompt.length,
      metadata: request.metadata,
    });

    const startTime = Date.now();

    try {
      const message = await retryWithBackoff(
        async () => {
          return this.client.messages.create({
            model: modelId,
            max_tokens: maxTokens,
            temperature,
            system: request.systemPrompt,
            messages: [
              {
                role: 'user',
                content: request.userPrompt,
              },
            ],
          });
        },
        this.maxRetries,
        this.baseRetryDelay,
      );

      const latencyMs = Date.now() - startTime;

      const content = this.extractContent(message);
      const usage = this.extractUsage(message);

      this.log.info('AI request completed', {
        requestId,
        model: modelId,
        latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        contentLength: content.length,
      });

      return {
        content,
        model: modelId,
        usage,
        requestId,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log.error('AI request failed', {
        requestId,
        model: modelId,
        latencyMs,
        error: errorMessage,
      });

      throw new ExternalServiceError(
        SERVICE_NAME,
        `Anthropic API call failed after ${this.maxRetries} retries: ${errorMessage}`,
      );
    }
  }

  /**
   * Resolves the model type ('opus' | 'sonnet') to the actual model identifier
   * from environment configuration.
   *
   * @param model - The model type.
   * @returns The full model identifier string.
   */
  protected resolveModelId(model: AIRequest['model']): string {
    switch (model) {
      case 'opus':
        return env.ANTHROPIC_OPUS_MODEL;
      case 'sonnet':
        return env.ANTHROPIC_SONNET_MODEL;
      default:
        return env.ANTHROPIC_SONNET_MODEL;
    }
  }

  /**
   * Extracts the text content from the Anthropic message response.
   *
   * @param message - The raw Anthropic API message response.
   * @returns The concatenated text content from all text blocks.
   */
  private extractContent(message: Anthropic.Message): string {
    const textBlocks = message.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );

    if (textBlocks.length === 0) {
      this.log.warn('AI response contained no text blocks');
      return '';
    }

    return textBlocks.map((block) => block.text).join('');
  }

  /**
   * Extracts token usage information from the Anthropic message response.
   *
   * @param message - The raw Anthropic API message response.
   * @returns Structured token usage data.
   */
  private extractUsage(message: Anthropic.Message): TokenUsage {
    const inputTokens = message.usage?.input_tokens ?? 0;
    const outputTokens = message.usage?.output_tokens ?? 0;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }
}

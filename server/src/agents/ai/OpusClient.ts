// ============================================================
// AI Integration Layer - Opus Client
// Phase 3B: Model-specific client for Claude Opus
// ============================================================

import { env } from '../../config/env';
import { createChildLogger } from '../../utils/logger';
import { AnthropicClient } from './AnthropicClient';
import type { AIRequest, AIResponse } from './types';

/**
 * Opus-specific client for high-complexity AI tasks.
 *
 * Wraps the base AnthropicClient with Opus-specific defaults:
 * - Higher default token limit (4096) for complex reasoning
 * - Lower temperature (0.5) for more consistent outputs
 * - Automatically routes all requests to the Opus model
 *
 * **Use cases:** orchestration, strategic planning, complex multi-step decisions,
 * cross-agent challenge resolution, market analysis synthesis.
 */
export class OpusClient extends AnthropicClient {
  private readonly opusLog;

  /**
   * Creates a new OpusClient instance.
   *
   * @param apiKey - Optional Anthropic API key override. Falls back to env.ANTHROPIC_API_KEY.
   */
  constructor(apiKey?: string) {
    super(apiKey);

    // Opus-specific defaults: higher token limit for complex outputs
    this.defaultMaxTokens = 4096;
    this.defaultTemperature = 0.5;

    this.opusLog = createChildLogger({
      component: 'OpusClient',
      model: env.ANTHROPIC_OPUS_MODEL,
    });

    this.opusLog.info('OpusClient initialized', {
      model: env.ANTHROPIC_OPUS_MODEL,
      defaultMaxTokens: this.defaultMaxTokens,
      defaultTemperature: this.defaultTemperature,
    });
  }

  /**
   * Sends a message using the Opus model.
   *
   * Overrides the model field in the request to always use 'opus', regardless
   * of what was originally specified.
   *
   * @param request - The AI request. The `model` field is forced to 'opus'.
   * @returns A structured AIResponse from the Opus model.
   */
  async sendMessage(request: AIRequest): Promise<AIResponse> {
    const opusRequest: AIRequest = {
      ...request,
      model: 'opus',
    };

    this.opusLog.debug('Routing request through Opus', {
      maxTokens: request.maxTokens ?? this.defaultMaxTokens,
      temperature: request.temperature ?? this.defaultTemperature,
      metadata: request.metadata,
    });

    return super.sendMessage(opusRequest);
  }

  /**
   * Sends a strategic analysis request optimized for Opus capabilities.
   *
   * Convenience method that wraps sendMessage with a strategy-oriented
   * system prompt prefix and higher token limit for detailed analysis.
   *
   * @param systemPrompt - The system prompt providing context for the analysis.
   * @param userPrompt - The user prompt with the specific analysis request.
   * @param metadata - Optional metadata for tracking and logging.
   * @returns A structured AIResponse containing the strategic analysis.
   */
  async analyzeStrategy(
    systemPrompt: string,
    userPrompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<AIResponse> {
    return this.sendMessage({
      model: 'opus',
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
      temperature: 0.4,
      metadata: { ...metadata, taskType: 'strategy_analysis' },
    });
  }

  /**
   * Sends an orchestration decision request optimized for Opus capabilities.
   *
   * Convenience method for multi-agent orchestration tasks where the model
   * needs to coordinate between different agents and make routing decisions.
   *
   * @param systemPrompt - The system prompt describing the orchestration context.
   * @param userPrompt - The user prompt with the specific orchestration task.
   * @param metadata - Optional metadata for tracking and logging.
   * @returns A structured AIResponse containing the orchestration decision.
   */
  async orchestrate(
    systemPrompt: string,
    userPrompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<AIResponse> {
    return this.sendMessage({
      model: 'opus',
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
      metadata: { ...metadata, taskType: 'orchestration' },
    });
  }
}

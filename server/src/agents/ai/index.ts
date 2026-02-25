// ============================================================
// AI Integration Layer - Barrel Exports
// Phase 3B: Anthropic API Integration
// ============================================================

// ---- Types ----
export type {
  AIModelType,
  AIRequest,
  AIResponse,
  TokenUsage,
  CostRecord,
  CostSummary,
  RateLimitConfig,
  RateLimitStatus,
  ModelPricing,
  ValidationResult,
  JSONValidationResult,
} from './types';

// ---- Clients ----
export { AnthropicClient } from './AnthropicClient';
export { OpusClient } from './OpusClient';
export { SonnetClient } from './SonnetClient';

// ---- Infrastructure ----
export { RateLimiter } from './RateLimiter';
export { CostTracker } from './CostTracker';
export { ResponseValidator } from './ResponseValidator';

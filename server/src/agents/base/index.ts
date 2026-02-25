// ============================================================
// AI International Growth Engine - Base Agent Framework Barrel Export
// Re-exports all base agent types, classes, and utilities
// ============================================================

// ---- Type definitions ----
export type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  ConfidenceLevelLabel,
  AgentConfig,
  AgentExecutionContext,
  AgentChallengeRequest,
  AgentChallengeResponse,
} from './types';

// ---- Base agent abstract class ----
export { BaseAgent } from './BaseAgent';

// ---- Agent registry (singleton) ----
export { AgentRegistry } from './AgentRegistry';

// ---- Agent lifecycle manager ----
export { AgentLifecycle } from './AgentLifecycle';

// ---- Confidence scoring utilities ----
export {
  calculateWeightedConfidence,
  getConfidenceLevel,
  meetsThreshold,
  aggregateConfidences,
  compareConfidences,
} from './ConfidenceScoring';

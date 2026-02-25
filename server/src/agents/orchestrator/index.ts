// ============================================================
// AI International Growth Engine - Orchestrator Module Barrel
// Phase 3D: Re-exports all orchestrator components
// ============================================================

// ---- Master Orchestrator Agent ----
export {
  MasterOrchestratorAgent,
  type Contradiction,
  type OrchestrationResult,
  type DecisionLogEntry,
} from './MasterOrchestratorAgent';

// ---- Decision Matrix ----
export {
  DecisionMatrixGenerator,
  type DecisionMatrixEntry,
  type DecisionMatrix,
} from './DecisionMatrix';

// ---- Agent Aggregator ----
export {
  AgentAggregator,
  type AgentConflict,
  type AggregatedResult,
  type CategorisedOutputs,
} from './AgentAggregator';

// ---- Action Assigner ----
export {
  ActionAssigner,
  type MarketingAction,
  type ActionPriority,
  type ActionStatus,
} from './ActionAssigner';

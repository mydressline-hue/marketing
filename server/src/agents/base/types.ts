// ============================================================
// AI International Growth Engine - Base Agent Type Definitions
// Shared types for the 20-agent framework
// ============================================================

import type { AgentType, CrossChallengeResult } from '../../types';

// ---- Agent Input / Output ----

/**
 * Standard input payload delivered to every agent's `process` method.
 * Contains the contextual data, tuning parameters, and a unique request
 * identifier used for tracing and idempotency.
 */
export interface AgentInput {
  /** Contextual data relevant to the agent's domain (market data, campaign state, etc.) */
  context: Record<string, unknown>;
  /** Tuning knobs and feature flags that influence agent behaviour for this run */
  parameters: Record<string, unknown>;
  /** Unique identifier for this execution request, used for tracing and deduplication */
  requestId: string;
}

/**
 * Standard output returned by every agent after processing.
 * Provides the decision, supporting data, confidence assessment,
 * human-readable reasoning, and any warnings or uncertainties.
 */
export interface AgentOutput {
  /** The type of agent that produced this output */
  agentType: AgentType;
  /** The primary decision or recommendation made by the agent */
  decision: string;
  /** Structured data supporting the decision (metrics, breakdowns, etc.) */
  data: Record<string, unknown>;
  /** Confidence assessment for this decision */
  confidence: AgentConfidenceScore;
  /** Human-readable explanation of how the agent arrived at its decision */
  reasoning: string;
  /** Actionable recommendations derived from the analysis */
  recommendations: string[];
  /** Issues or risks identified during processing */
  warnings: string[];
  /** Areas where the agent lacks sufficient data or certainty */
  uncertainties: string[];
  /** ISO-8601 timestamp of when the output was generated */
  timestamp: string;
}

// ---- Confidence Scoring ----

/** Discrete confidence levels mapped from the numeric score */
export type ConfidenceLevelLabel = 'low' | 'medium' | 'high' | 'very_high';

/**
 * Confidence assessment for an agent's decision.
 * Combines a numeric score (0-100) with a categorical level and
 * the individual contributing factors that were used to compute it.
 */
export interface AgentConfidenceScore {
  /** Numeric confidence score from 0 (no confidence) to 100 (absolute certainty) */
  score: number;
  /** Categorical confidence level derived from the score */
  level: ConfidenceLevelLabel;
  /** Individual factor scores that contributed to the overall confidence (each 0-100) */
  factors: Record<string, number>;
}

// ---- Agent Configuration ----

/**
 * Static configuration that defines an agent's operational parameters.
 * Passed to the BaseAgent constructor and used throughout its lifecycle.
 */
export interface AgentConfig {
  /** Which of the 20 agent types this configuration belongs to */
  agentType: AgentType;
  /** The Claude model tier to use for AI calls */
  model: 'opus' | 'sonnet';
  /** Maximum number of retry attempts for transient failures */
  maxRetries: number;
  /** Hard timeout in milliseconds for a single process() invocation */
  timeoutMs: number;
  /** Minimum confidence score (0-100) required to auto-approve a decision */
  confidenceThreshold: number;
}

// ---- Execution Context ----

/**
 * Runtime context available during a single agent execution.
 * Extends the raw input with metadata about the execution environment,
 * allowing agents to adapt behaviour based on caller, timing, and priority.
 */
export interface AgentExecutionContext {
  /** The original agent input */
  input: AgentInput;
  /** ISO-8601 timestamp when this execution started */
  startedAt: string;
  /** ID of the user or system that triggered this execution */
  triggeredBy: string;
  /** Execution priority — higher-priority runs may pre-empt lower ones */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Optional parent request ID for tracing multi-agent orchestration chains */
  parentRequestId?: string;
  /** Accumulated metadata from upstream agents in an orchestration pipeline */
  metadata?: Record<string, unknown>;
}

// ---- Cross-Challenge Protocol ----

/**
 * Request sent from the orchestrator (or another agent) asking an agent
 * to challenge / validate a peer's decision.
 */
export interface AgentChallengeRequest {
  /** Unique ID for this challenge interaction */
  challengeId: string;
  /** The agent type being asked to perform the challenge */
  challengerType: AgentType;
  /** The agent type whose decision is being challenged */
  challengedType: AgentType;
  /** The original decision output that should be scrutinised */
  decision: AgentOutput;
  /** Specific aspects the challenger should focus on (e.g. 'budget_accuracy', 'compliance') */
  focusAreas: string[];
  /** ISO-8601 timestamp when the challenge was issued */
  requestedAt: string;
}

/**
 * Response returned by an agent after evaluating a peer's decision
 * through the cross-challenge protocol.
 */
export interface AgentChallengeResponse {
  /** The challenge ID this response corresponds to */
  challengeId: string;
  /** The agent type that performed the challenge */
  challengerType: AgentType;
  /** The agent type that was challenged */
  challengedType: AgentType;
  /** Whether the challenger agrees with, partially agrees with, or disagrees with the decision */
  verdict: 'agree' | 'partial_disagree' | 'disagree';
  /** Detailed findings from the challenge review */
  findings: CrossChallengeResult[];
  /** Overall confidence the challenger has in its own review */
  confidence: AgentConfidenceScore;
  /** Suggested modifications to the original decision, if any */
  suggestedChanges: Record<string, unknown>;
  /** ISO-8601 timestamp when the challenge was completed */
  completedAt: string;
}

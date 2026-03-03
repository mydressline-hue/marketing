// ============================================================
// AI International Growth Engine - Cross-Challenge Protocol Types
// Type definitions for the agent cross-challenge system
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput } from '../base/types';

// ---- Severity ----

/** Severity levels used across challenge findings and inconsistencies */
export type ChallengeSeverity = 'info' | 'warning' | 'critical';

// ---- Challenge Request / Response ----

/**
 * A request for one agent to challenge another agent's decision output.
 * Issued by the CrossChallengeProtocol orchestrator to initiate a review.
 */
export interface ChallengeRequest {
  /** The agent type performing the challenge review */
  challengerId: AgentType;
  /** The agent type whose decision is being challenged */
  challengedId: AgentType;
  /** Unique identifier for the decision being challenged */
  decisionId: string;
  /** The original output produced by the challenged agent */
  originalOutput: AgentOutput;
  /** Specific areas the challenger should focus on during review */
  challengeAreas: string[];
}

/**
 * The result of an agent's challenge review of a peer's decision.
 * Contains individual findings and an overall severity assessment.
 */
export interface ChallengeResponse {
  /** The agent type that performed the challenge */
  challengerId: AgentType;
  /** The agent type that was challenged */
  challengedId: AgentType;
  /** Individual findings discovered during the challenge review */
  findings: ChallengeFinding[];
  /** The highest severity level among all findings */
  overallSeverity: ChallengeSeverity;
  /** Confidence score (0-100) the challenger has in its findings */
  confidence: number;
  /** Whether all findings in this response have been addressed */
  resolved: boolean;
}

/**
 * A single finding discovered during a challenge review.
 * Represents one specific issue, concern, or observation about the challenged decision.
 */
export interface ChallengeFinding {
  /** The domain area this finding relates to (e.g. 'budget', 'targeting', 'compliance') */
  area: string;
  /** Description of the issue found */
  issue: string;
  /** How severe this finding is */
  severity: ChallengeSeverity;
  /** Evidence or data supporting this finding */
  evidence: string;
  /** Optional recommendation for how to address this finding */
  suggestedFix?: string;
}

// ---- Challenge Rounds ----

/**
 * A complete round of cross-challenges across all agents.
 * Each round contains all challenge responses, detected inconsistencies, and gaps.
 */
export interface ChallengeRound {
  /** Sequential round number within a full challenge cycle */
  roundNumber: number;
  /** All challenge responses collected during this round */
  challenges: ChallengeResponse[];
  /** Inconsistencies detected between agent outputs in this round */
  inconsistencies: Inconsistency[];
  /** Data and strategy gaps identified during this round */
  gaps: Gap[];
  /** ISO-8601 timestamp when this round completed */
  timestamp: string;
}

// ---- Inconsistencies ----

/**
 * An inconsistency detected between two or more agents' outputs.
 * Represents a situation where agents have produced conflicting decisions or data.
 */
export interface Inconsistency {
  /** The agents involved in this inconsistency */
  agents: AgentType[];
  /** The domain area where the inconsistency was found */
  area: string;
  /** The conflicting values from each agent, keyed by agent type */
  values: Record<string, unknown>;
  /** Severity level of this inconsistency */
  severity: ChallengeSeverity;
  /** Human-readable description of the inconsistency */
  description: string;
}

// ---- Gaps ----

/**
 * A gap in data or strategy identified by an agent.
 * Represents missing information or a strategic blind spot that should be addressed.
 */
export interface Gap {
  /** The agent that reported this gap */
  reportedBy: AgentType;
  /** The domain area where the gap exists */
  area: string;
  /** Human-readable description of the gap */
  description: string;
  /** Specific data points or information needed to fill this gap */
  dataNeeded: string[];
  /** The potential impact of leaving this gap unaddressed */
  impact: string;
}

// ---- Contradiction Resolution ----

/** Methods available for resolving contradictions between agents */
export type ResolutionMethod = 'confidence_based' | 'manual_review' | 'data_backed';

/**
 * The outcome of resolving an inconsistency between agents.
 * Records which method was used, which agent's position was accepted (if any),
 * and the reasoning behind the resolution.
 */
export interface ContradictionResolution {
  /** The inconsistency that was resolved */
  inconsistency: Inconsistency;
  /** Description of how the inconsistency was resolved */
  resolution: string;
  /** The method used to arrive at the resolution */
  method: ResolutionMethod;
  /** The agent whose position was accepted, if applicable */
  winningAgent?: AgentType;
  /** Detailed reasoning for why this resolution was chosen */
  reasoning: string;
}

// ---- Challenge Map ----

/**
 * Configuration entry mapping an agent to the agents it is responsible for challenging.
 * Each agent must challenge at least 3 others to ensure comprehensive cross-validation.
 */
export interface ChallengeMapEntry {
  /** The agent that performs the challenges */
  challenger: AgentType;
  /** The agents this challenger is responsible for reviewing */
  targets: AgentType[];
  /** The specific areas this challenger should focus on for each target */
  focusAreas: Record<string, string[]>;
}

/**
 * Complete challenge map configuration defining which agents challenge which.
 * Every agent in the system must appear as a challenger with at least 3 targets.
 */
export type ChallengeMapConfig = ChallengeMapEntry[];

// ---- Gap Report ----

/**
 * A compiled report of all gaps identified during a challenge cycle.
 * Provides a summary, highlights critical gaps, and offers actionable recommendations.
 */
export interface GapReport {
  /** High-level summary of the gap analysis */
  summary: string;
  /** Gaps classified as critical that require immediate attention */
  critical: Gap[];
  /** Actionable recommendations for addressing the identified gaps */
  recommendations: string[];
}

// ---- DB Persistence Shapes ----

/**
 * Row shape used when persisting a challenge round to the database.
 * Serializes the rich objects into JSON columns for storage.
 */
export interface ChallengeRoundRow {
  id: string;
  round_number: number;
  challenges_json: string;
  inconsistencies_json: string;
  gaps_json: string;
  created_at: string;
}

/**
 * Row shape used when persisting a gap report to the database.
 */
export interface GapReportRow {
  id: string;
  summary: string;
  critical_gaps_json: string;
  recommendations_json: string;
  created_at: string;
}

/**
 * Row shape used when persisting a contradiction resolution to the database.
 */
export interface ContradictionResolutionRow {
  id: string;
  inconsistency_json: string;
  resolution: string;
  method: ResolutionMethod;
  winning_agent: string | null;
  reasoning: string;
  created_at: string;
}

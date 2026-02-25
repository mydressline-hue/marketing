// ============================================================
// AI International Growth Engine - Cross-Challenge Protocol
// Barrel export for the agent cross-challenge system
// ============================================================

// ---- Types ----
export type {
  ChallengeSeverity,
  ChallengeRequest,
  ChallengeResponse,
  ChallengeFinding,
  ChallengeRound,
  Inconsistency,
  Gap,
  ResolutionMethod,
  ContradictionResolution,
  ChallengeMapEntry,
  ChallengeMapConfig,
  GapReport,
  ChallengeRoundRow,
  GapReportRow,
  ContradictionResolutionRow,
} from './types';

// ---- Classes ----
export { CrossChallengeProtocol } from './CrossChallengeProtocol';
export { InconsistencyDetector } from './InconsistencyDetector';
export { ContradictionResolver } from './ContradictionResolver';
export { GapReporter } from './GapReporter';

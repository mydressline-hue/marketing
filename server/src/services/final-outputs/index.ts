/**
 * Final Outputs Services - Barrel File.
 *
 * Re-exports all final output deliverable services for convenient imports.
 */

export {
  CountryRankingService,
  type CountryRankingEntry,
  type CountryRankingTable,
  type ScoringMethodology,
} from './CountryRankingService';

export {
  CountryStrategyOutputService,
  type CountryMarketingStrategy,
  type PlatformAllocation,
  type StrategySummary,
} from './CountryStrategyOutputService';

export {
  ChannelAllocationOutputService,
  type ChannelAllocation,
  type ChannelAllocationMatrix,
  type ChannelPerformanceHistory,
  type CountryChannelEntry,
  type CountryChannels,
} from './ChannelAllocationOutputService';

export {
  ConfidenceScoreOutputService,
  scoreToGrade,
  type SystemGrade,
  type AgentScoreEntry,
  type CategoryScores,
  type ScoreTrendEntry,
  type LowConfidenceAlert,
  type SystemConfidenceResult,
  type AgentConfidenceBreakdown,
  type ConfidenceTrendResult,
} from './ConfidenceScoreOutputService';

export {
  BudgetAllocationOutputService,
  type BudgetAllocationModel,
  type ChannelAllocationEntry,
  type CountryBudgetEntry,
  type CountryChannelSplit,
  type BudgetGuardrails,
  type ReallocationRecommendation,
  type SpendingVelocityResult,
  type BudgetUtilizationResult,
} from './BudgetAllocationOutputService';

export {
  WeaknessReportOutputService,
  type WeaknessReport,
  type Weakness,
  type ContradictionEntry,
  type DataGapEntry,
  type ImprovementAction,
  type CrossChallengeSummary,
  type OverallHealth,
  type WeaknessSeverity,
} from './WeaknessReportOutputService';

export {
  ROIProjectionOutputService,
  type ScenarioProjection,
  type ROISummary,
  type LTVCACAnalysis,
  type CountryLTVCAC,
  type ChannelROI,
  type MonthlyForecastEntry,
  type ROIProjectionOutput,
  type CountryROI,
  type ROITrendEntry,
  type ROITrendOutput,
} from './ROIProjectionOutputService';

export {
  PerfectionRecommendationsOutputService,
  type PerfectionRecommendationsOutput,
  type PerfectionRecommendation,
  type MaturityAssessment,
  type MaturityLevel,
  type RecommendationCategory,
  type RecommendationPriority,
  type EnterpriseGrade,
  type NextStep,
  type Benchmarks,
} from './PerfectionRecommendationsOutputService';

export {
  TestCoverageReportService,
  type TestCoverageReport,
  type ModuleCoverage,
} from './TestCoverageReportService';

export {
  ExecutionRoadmapOutputService,
  type ExecutionRoadmap,
  type RoadmapPhase,
  type RoadmapKeyAction,
  type RoadmapMilestone,
  type CriticalPathTask,
  type ResourceRequirements,
  type KPITarget,
} from './ExecutionRoadmapOutputService';

export {
  RiskAssessmentOutputService,
  type RiskAssessmentReport,
  type RiskEntry,
  type RiskCategory,
  type RiskLevel,
  type ComplianceStatusReport,
  type FraudMetrics,
  type SecurityPosture,
  type RiskTrendPoint,
  type MitigationAction,
} from './RiskAssessmentOutputService';

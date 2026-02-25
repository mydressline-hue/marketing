/**
 * Advanced AI routes (Phase 7).
 *
 * Mounts simulation engine, continuous learning, marketing models,
 * strategic commander, and campaign health monitor endpoints with
 * authentication and role-based access control.
 *
 * Read endpoints require at least viewer-level access (read:agents),
 * while write/mutate endpoints require elevated privileges
 * (write:agents). Campaign-manager-level users can acknowledge
 * health alerts (write:campaigns).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  // Simulation Engine (7A)
  runCampaignSimulation,
  runScalingPrediction,
  modelCompetitorReaction,
  modelCpcInflation,
  modelAudienceSaturation,
  runSandboxSimulation,
  preLaunchRiskAssessment,
  getSimulationHistory,
  getSimulationById,
  compareSimulations,
  // Continuous Learning (7B)
  recordStrategyOutcome,
  evaluateStrategy,
  getImprovementSuggestions,
  storeStrategyMemory,
  queryStrategyMemory,
  getTopStrategies,
  recordCountryPerformance,
  getCountryPerformanceHistory,
  getCountryTrends,
  detectCreativeFatigue,
  getRotationRecommendations,
  getSeasonalPatterns,
  recordMarketSignal,
  analyzeMarketTrends,
  getLearningStatus,
  // Marketing Models (7C)
  runMarketingMixModel,
  runBayesianAttribution,
  runEconometricModel,
  createGeoLiftTest,
  analyzeGeoLiftResults,
  listGeoLiftTests,
  createBrandLiftSurvey,
  recordBrandLiftResults,
  analyzeBrandLift,
  recordOfflineConversion,
  getOfflineAttributionReport,
  runSaturationAnalysis,
  calculateDiminishingReturns,
  getModelsDashboard,
  getModelById,
  // Strategic Commander (7D)
  generateProjection,
  getProjectionHistory,
  getProjectionAccuracy,
  generateScenarios,
  selectOptimalScenario,
  initiateChallenge,
  runDevilsAdvocate,
  getPortfolioExposure,
  getCountryExposure,
  compareStrategies,
  runPreBudgetSimulation,
  optimizeBudget,
  getCommanderDashboard,
  getStrategicRecommendations,
  // Campaign Health Monitor (7E)
  getCampaignHealthScore,
  getCpaVolatility,
  getSpendVelocity,
  getCampaignCreativeFatigue,
  getCtrCollapse,
  getPixelSignal,
  runFullHealthCheck,
  getHealthDashboard,
  getHealthAlerts,
  acknowledgeHealthAlert,
  getHealthTrends,
  setHealthThresholds,
} from '../controllers/advanced-ai.controller';

const router = Router();

// ---------------------------------------------------------------------------
// All routes require authentication
// ---------------------------------------------------------------------------

router.use(authenticate);

// ---------------------------------------------------------------------------
// Simulation Engine routes -- prefix: /simulation (7A)
// ---------------------------------------------------------------------------

// POST /simulation/campaign -- run campaign simulation (write)
router.post(
  '/simulation/campaign',
  requirePermission('write:agents'),
  runCampaignSimulation,
);

// POST /simulation/scaling -- run scaling prediction (write)
router.post(
  '/simulation/scaling',
  requirePermission('write:agents'),
  runScalingPrediction,
);

// POST /simulation/competitor-reaction -- model competitor reaction (write)
router.post(
  '/simulation/competitor-reaction',
  requirePermission('write:agents'),
  modelCompetitorReaction,
);

// POST /simulation/cpc-inflation -- model CPC inflation (write)
router.post(
  '/simulation/cpc-inflation',
  requirePermission('write:agents'),
  modelCpcInflation,
);

// POST /simulation/audience-saturation -- model audience saturation (write)
router.post(
  '/simulation/audience-saturation',
  requirePermission('write:agents'),
  modelAudienceSaturation,
);

// POST /simulation/sandbox -- run sandbox simulation (write)
router.post(
  '/simulation/sandbox',
  requirePermission('write:agents'),
  runSandboxSimulation,
);

// POST /simulation/pre-launch-risk/:campaignId -- pre-launch risk assessment (write)
router.post(
  '/simulation/pre-launch-risk/:campaignId',
  requirePermission('write:agents'),
  preLaunchRiskAssessment,
);

// GET /simulation/history -- get simulation history (read)
router.get(
  '/simulation/history',
  requirePermission('read:agents'),
  getSimulationHistory,
);

// GET /simulation/:id -- get simulation by ID (read)
router.get(
  '/simulation/:id',
  requirePermission('read:agents'),
  getSimulationById,
);

// POST /simulation/compare -- compare simulations (read)
router.post(
  '/simulation/compare',
  requirePermission('read:agents'),
  compareSimulations,
);

// ---------------------------------------------------------------------------
// Continuous Learning routes -- prefix: /learning (7B)
// ---------------------------------------------------------------------------

// POST /learning/outcomes -- record strategy outcome (write)
router.post(
  '/learning/outcomes',
  requirePermission('write:agents'),
  recordStrategyOutcome,
);

// GET /learning/strategy-evaluation/:strategyId -- evaluate strategy (read)
router.get(
  '/learning/strategy-evaluation/:strategyId',
  requirePermission('read:agents'),
  evaluateStrategy,
);

// GET /learning/improvement-suggestions/:strategyId -- get suggestions (read)
router.get(
  '/learning/improvement-suggestions/:strategyId',
  requirePermission('read:agents'),
  getImprovementSuggestions,
);

// POST /learning/strategy-memory -- store strategy memory (write)
router.post(
  '/learning/strategy-memory',
  requirePermission('write:agents'),
  storeStrategyMemory,
);

// GET /learning/strategy-memory -- query strategy memory (read)
router.get(
  '/learning/strategy-memory',
  requirePermission('read:agents'),
  queryStrategyMemory,
);

// GET /learning/top-strategies/:country/:channel -- top strategies (read)
router.get(
  '/learning/top-strategies/:country/:channel',
  requirePermission('read:agents'),
  getTopStrategies,
);

// POST /learning/country-performance -- record country performance (write)
router.post(
  '/learning/country-performance',
  requirePermission('write:agents'),
  recordCountryPerformance,
);

// GET /learning/country-performance/:country -- country performance history (read)
router.get(
  '/learning/country-performance/:country',
  requirePermission('read:agents'),
  getCountryPerformanceHistory,
);

// GET /learning/country-trends/:country -- country trends (read)
router.get(
  '/learning/country-trends/:country',
  requirePermission('read:agents'),
  getCountryTrends,
);

// GET /learning/creative-fatigue/:creativeId -- detect creative fatigue (read)
router.get(
  '/learning/creative-fatigue/:creativeId',
  requirePermission('read:agents'),
  detectCreativeFatigue,
);

// GET /learning/rotation-recommendations/:campaignId -- rotation recommendations (read)
router.get(
  '/learning/rotation-recommendations/:campaignId',
  requirePermission('read:agents'),
  getRotationRecommendations,
);

// GET /learning/seasonal-patterns/:country -- seasonal patterns (read)
router.get(
  '/learning/seasonal-patterns/:country',
  requirePermission('read:agents'),
  getSeasonalPatterns,
);

// POST /learning/market-signal -- record market signal (write)
router.post(
  '/learning/market-signal',
  requirePermission('write:agents'),
  recordMarketSignal,
);

// GET /learning/market-trends/:country/:channel -- market trends (read)
router.get(
  '/learning/market-trends/:country/:channel',
  requirePermission('read:agents'),
  analyzeMarketTrends,
);

// GET /learning/status -- learning system status (read)
router.get(
  '/learning/status',
  requirePermission('read:agents'),
  getLearningStatus,
);

// ---------------------------------------------------------------------------
// Marketing Models routes -- prefix: /models (7C)
// ---------------------------------------------------------------------------

// POST /models/mmm -- run Marketing Mix Model (write)
router.post(
  '/models/mmm',
  requirePermission('write:agents'),
  runMarketingMixModel,
);

// POST /models/bayesian-attribution -- run Bayesian attribution (write)
router.post(
  '/models/bayesian-attribution',
  requirePermission('write:agents'),
  runBayesianAttribution,
);

// POST /models/econometric -- run econometric model (write)
router.post(
  '/models/econometric',
  requirePermission('write:agents'),
  runEconometricModel,
);

// POST /models/geo-lift -- create geo lift test (write)
router.post(
  '/models/geo-lift',
  requirePermission('write:agents'),
  createGeoLiftTest,
);

// GET /models/geo-lift/:testId/results -- analyze geo lift results (read)
router.get(
  '/models/geo-lift/:testId/results',
  requirePermission('read:agents'),
  analyzeGeoLiftResults,
);

// GET /models/geo-lift -- list geo lift tests (read)
router.get(
  '/models/geo-lift',
  requirePermission('read:agents'),
  listGeoLiftTests,
);

// POST /models/brand-lift -- create brand lift survey (write)
router.post(
  '/models/brand-lift',
  requirePermission('write:agents'),
  createBrandLiftSurvey,
);

// POST /models/brand-lift/:surveyId/results -- record survey results (write)
router.post(
  '/models/brand-lift/:surveyId/results',
  requirePermission('write:agents'),
  recordBrandLiftResults,
);

// GET /models/brand-lift/:surveyId/analysis -- analyze brand lift (read)
router.get(
  '/models/brand-lift/:surveyId/analysis',
  requirePermission('read:agents'),
  analyzeBrandLift,
);

// POST /models/offline-conversion -- record offline conversion (write)
router.post(
  '/models/offline-conversion',
  requirePermission('write:agents'),
  recordOfflineConversion,
);

// GET /models/offline-attribution -- offline attribution report (read)
router.get(
  '/models/offline-attribution',
  requirePermission('read:agents'),
  getOfflineAttributionReport,
);

// POST /models/saturation-analysis -- run saturation analysis (write)
router.post(
  '/models/saturation-analysis',
  requirePermission('write:agents'),
  runSaturationAnalysis,
);

// POST /models/diminishing-returns -- calculate diminishing returns (write)
router.post(
  '/models/diminishing-returns',
  requirePermission('write:agents'),
  calculateDiminishingReturns,
);

// GET /models/dashboard -- models dashboard (read)
router.get(
  '/models/dashboard',
  requirePermission('read:agents'),
  getModelsDashboard,
);

// GET /models/:modelId -- get model by ID (read)
router.get(
  '/models/:modelId',
  requirePermission('read:agents'),
  getModelById,
);

// ---------------------------------------------------------------------------
// Strategic Commander routes -- prefix: /commander (7D)
// ---------------------------------------------------------------------------

// POST /commander/projection -- generate projection (write)
router.post(
  '/commander/projection',
  requirePermission('write:agents'),
  generateProjection,
);

// GET /commander/projections -- get projection history (read)
router.get(
  '/commander/projections',
  requirePermission('read:agents'),
  getProjectionHistory,
);

// GET /commander/projection/:id/accuracy -- compare projection to actual (read)
router.get(
  '/commander/projection/:id/accuracy',
  requirePermission('read:agents'),
  getProjectionAccuracy,
);

// POST /commander/scenarios -- generate risk-weighted scenarios (write)
router.post(
  '/commander/scenarios',
  requirePermission('write:agents'),
  generateScenarios,
);

// POST /commander/scenarios/select -- select optimal scenario (write)
router.post(
  '/commander/scenarios/select',
  requirePermission('write:agents'),
  selectOptimalScenario,
);

// POST /commander/challenge -- initiate internal challenge (write)
router.post(
  '/commander/challenge',
  requirePermission('write:agents'),
  initiateChallenge,
);

// POST /commander/devils-advocate -- run devil's advocate analysis (write)
router.post(
  '/commander/devils-advocate',
  requirePermission('write:agents'),
  runDevilsAdvocate,
);

// GET /commander/exposure/portfolio -- total portfolio exposure (read)
router.get(
  '/commander/exposure/portfolio',
  requirePermission('read:agents'),
  getPortfolioExposure,
);

// GET /commander/exposure/country/:country -- country exposure (read)
router.get(
  '/commander/exposure/country/:country',
  requirePermission('read:agents'),
  getCountryExposure,
);

// POST /commander/strategy-comparison -- compare strategies (write)
router.post(
  '/commander/strategy-comparison',
  requirePermission('write:agents'),
  compareStrategies,
);

// POST /commander/pre-budget-simulation -- pre-budget simulation (write)
router.post(
  '/commander/pre-budget-simulation',
  requirePermission('write:agents'),
  runPreBudgetSimulation,
);

// POST /commander/optimize-budget -- optimize budget distribution (write)
router.post(
  '/commander/optimize-budget',
  requirePermission('write:agents'),
  optimizeBudget,
);

// GET /commander/dashboard -- commander dashboard (read)
router.get(
  '/commander/dashboard',
  requirePermission('read:agents'),
  getCommanderDashboard,
);

// GET /commander/recommendations -- strategic recommendations (read)
router.get(
  '/commander/recommendations',
  requirePermission('read:agents'),
  getStrategicRecommendations,
);

// ---------------------------------------------------------------------------
// Campaign Health Monitor routes -- prefix: /health (7E)
// ---------------------------------------------------------------------------

// GET /health/campaign/:campaignId -- overall campaign health score (read)
router.get(
  '/health/campaign/:campaignId',
  requirePermission('read:agents'),
  getCampaignHealthScore,
);

// GET /health/campaign/:campaignId/cpa-volatility -- CPA volatility check (read)
router.get(
  '/health/campaign/:campaignId/cpa-volatility',
  requirePermission('read:agents'),
  getCpaVolatility,
);

// GET /health/campaign/:campaignId/spend-velocity -- spend velocity check (read)
router.get(
  '/health/campaign/:campaignId/spend-velocity',
  requirePermission('read:agents'),
  getSpendVelocity,
);

// GET /health/campaign/:campaignId/creative-fatigue -- creative fatigue scores (read)
router.get(
  '/health/campaign/:campaignId/creative-fatigue',
  requirePermission('read:agents'),
  getCampaignCreativeFatigue,
);

// GET /health/campaign/:campaignId/ctr-collapse -- CTR collapse check (read)
router.get(
  '/health/campaign/:campaignId/ctr-collapse',
  requirePermission('read:agents'),
  getCtrCollapse,
);

// GET /health/campaign/:campaignId/pixel-signal -- pixel signal check (read)
router.get(
  '/health/campaign/:campaignId/pixel-signal',
  requirePermission('read:agents'),
  getPixelSignal,
);

// POST /health/campaign/:campaignId/full-check -- run full health check (write)
router.post(
  '/health/campaign/:campaignId/full-check',
  requirePermission('write:agents'),
  runFullHealthCheck,
);

// GET /health/dashboard -- health dashboard (read)
router.get(
  '/health/dashboard',
  requirePermission('read:agents'),
  getHealthDashboard,
);

// GET /health/alerts -- all health alerts (read)
router.get(
  '/health/alerts',
  requirePermission('read:agents'),
  getHealthAlerts,
);

// POST /health/alerts/:alertId/acknowledge -- acknowledge alert (campaign_manager+)
router.post(
  '/health/alerts/:alertId/acknowledge',
  requirePermission('write:campaigns'),
  acknowledgeHealthAlert,
);

// GET /health/trends -- health trends (read)
router.get(
  '/health/trends',
  requirePermission('read:agents'),
  getHealthTrends,
);

// POST /health/thresholds -- set thresholds (write)
router.post(
  '/health/thresholds',
  requirePermission('write:agents'),
  setHealthThresholds,
);

export default router;

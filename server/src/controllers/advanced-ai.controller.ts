/**
 * Advanced AI controllers -- Express request handlers (Phase 7).
 *
 * Handlers delegate to SimulationService, LearningService,
 * MarketingModelsService, CommanderService, and HealthMonitorService,
 * returning structured JSON envelopes: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { SimulationService } from '../services/simulation/SimulationService';
import { LearningService } from '../services/learning/LearningService';
import { MarketingModelsService } from '../services/marketing/MarketingModelsService';
import { CommanderService } from '../services/commander/CommanderService';
import { HealthMonitorService } from '../services/health/HealthMonitorService';

// ===========================================================================
// Simulation Engine Handlers (7A)
// ===========================================================================

/**
 * POST /simulation/campaign
 * Run a full campaign simulation with specified parameters.
 */
export const runCampaignSimulation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { campaign, parameters, scenarios } = req.body;

  const result = await SimulationService.runCampaignSimulation({ campaign, parameters, scenarios }, userId);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/scaling
 * Run scaling prediction for a campaign or channel.
 */
export const runScalingPrediction = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId, channel, country, targetBudget, timeframe } = req.body;

  const result = await SimulationService.runScalingPrediction({
    campaignId,
    channel,
    country,
    targetBudget,
    timeframe,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/competitor-reaction
 * Model how competitors might react to a given strategy.
 */
export const modelCompetitorReaction = asyncHandler(async (req: Request, res: Response) => {
  const { strategy, market, competitors, timeframe } = req.body;

  const result = await SimulationService.modelCompetitorReaction({
    strategy,
    market,
    competitors,
    timeframe,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/cpc-inflation
 * Model CPC inflation over time for a given market/channel.
 */
export const modelCpcInflation = asyncHandler(async (req: Request, res: Response) => {
  const { channel, country, timeframe, competitorActivity } = req.body;

  const result = await SimulationService.modelCpcInflation({
    channel,
    country,
    timeframe,
    competitorActivity,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/audience-saturation
 * Model audience saturation for a campaign or segment.
 */
export const modelAudienceSaturation = asyncHandler(async (req: Request, res: Response) => {
  const { audience, channel, country, currentReach, budget } = req.body;

  const result = await SimulationService.modelAudienceSaturation({
    audience,
    channel,
    country,
    currentReach,
    budget,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/sandbox
 * Run a sandbox simulation with custom parameters.
 */
export const runSandboxSimulation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, description, parameters, constraints } = req.body;

  const result = await SimulationService.runSandboxSimulation(
    { name, description, parameters, constraints },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/pre-launch-risk/:campaignId
 * Run pre-launch risk assessment for a specific campaign.
 */
export const preLaunchRiskAssessment = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;
  const { scenarios, riskFactors } = req.body;

  const result = await SimulationService.preLaunchRiskAssessment(campaignId, { scenarios, riskFactors });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /simulation/history
 * Get simulation history with optional filters.
 */
export const getSimulationHistory = asyncHandler(async (req: Request, res: Response) => {
  const { type, page, limit, startDate, endDate } = req.query;

  const result = await SimulationService.getSimulationHistory({
    type: type as string | undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /simulation/:id
 * Get a specific simulation by ID.
 */
export const getSimulationById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await SimulationService.getSimulationById(id);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /simulation/compare
 * Compare multiple simulations side by side.
 */
export const compareSimulations = asyncHandler(async (req: Request, res: Response) => {
  const { simulationIds, metrics } = req.body;

  const result = await SimulationService.compareSimulations(simulationIds, metrics);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Continuous Learning Handlers (7B)
// ===========================================================================

/**
 * POST /learning/outcomes
 * Record a strategy outcome for continuous learning.
 */
export const recordStrategyOutcome = asyncHandler(async (req: Request, res: Response) => {
  const { strategyId, outcome, metrics, context } = req.body;

  const result = await LearningService.recordStrategyOutcome({ strategyId, outcome, metrics, context });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/strategy-evaluation/:strategyId
 * Evaluate a strategy based on historical outcomes.
 */
export const evaluateStrategy = asyncHandler(async (req: Request, res: Response) => {
  const { strategyId } = req.params;

  const result = await LearningService.evaluateStrategy(strategyId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/improvement-suggestions/:strategyId
 * Get AI-generated improvement suggestions for a strategy.
 */
export const getImprovementSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const { strategyId } = req.params;

  const result = await LearningService.getImprovementSuggestions(strategyId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /learning/strategy-memory
 * Store a strategy memory entry for future reference.
 */
export const storeStrategyMemory = asyncHandler(async (req: Request, res: Response) => {
  const { strategyId, memoryType, content, tags } = req.body;

  const result = await LearningService.storeStrategyMemory({ strategyId, memoryType, content, tags });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/strategy-memory
 * Query strategy memory with optional filters.
 */
export const queryStrategyMemory = asyncHandler(async (req: Request, res: Response) => {
  const { strategyId, memoryType, tags, page, limit } = req.query;

  const result = await LearningService.queryStrategyMemory({
    strategyId: strategyId as string | undefined,
    memoryType: memoryType as string | undefined,
    tags: tags as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /learning/top-strategies/:country/:channel
 * Get top-performing strategies for a country and channel.
 */
export const getTopStrategies = asyncHandler(async (req: Request, res: Response) => {
  const { country, channel } = req.params;
  const { limit, timeframe } = req.query;

  const result = await LearningService.getTopStrategies(country, channel, {
    limit: limit ? parseInt(limit as string, 10) : 10,
    timeframe: timeframe as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /learning/country-performance
 * Record country-level performance data.
 */
export const recordCountryPerformance = asyncHandler(async (req: Request, res: Response) => {
  const { country, channel, metrics, period } = req.body;

  const result = await LearningService.recordCountryPerformance({ country, channel, metrics, period });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/country-performance/:country
 * Get performance history for a specific country.
 */
export const getCountryPerformanceHistory = asyncHandler(async (req: Request, res: Response) => {
  const { country } = req.params;
  const { channel, startDate, endDate } = req.query;

  const result = await LearningService.getCountryPerformanceHistory(country, {
    channel: channel as string | undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/country-trends/:country
 * Get trend analysis for a specific country.
 */
export const getCountryTrends = asyncHandler(async (req: Request, res: Response) => {
  const { country } = req.params;
  const { channel, metric, timeframe } = req.query;

  const result = await LearningService.getCountryTrends(country, {
    channel: channel as string | undefined,
    metric: metric as string | undefined,
    timeframe: timeframe as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/creative-fatigue/:creativeId
 * Detect creative fatigue for a specific creative asset.
 */
export const detectCreativeFatigue = asyncHandler(async (req: Request, res: Response) => {
  const { creativeId } = req.params;

  const result = await LearningService.detectCreativeFatigue(creativeId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/rotation-recommendations/:campaignId
 * Get creative rotation recommendations for a campaign.
 */
export const getRotationRecommendations = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await LearningService.getRotationRecommendations(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/seasonal-patterns/:country
 * Get seasonal performance patterns for a country.
 */
export const getSeasonalPatterns = asyncHandler(async (req: Request, res: Response) => {
  const { country } = req.params;
  const { channel, metric } = req.query;

  const result = await LearningService.getSeasonalPatterns(country, {
    channel: channel as string | undefined,
    metric: metric as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /learning/market-signal
 * Record a market signal (e.g., competitor move, regulation change).
 */
export const recordMarketSignal = asyncHandler(async (req: Request, res: Response) => {
  const { country, channel, signalType, description, impact } = req.body;

  const result = await LearningService.recordMarketSignal({
    country,
    channel,
    signalType,
    description,
    impact,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/market-trends/:country/:channel
 * Analyze market trends for a country and channel.
 */
export const analyzeMarketTrends = asyncHandler(async (req: Request, res: Response) => {
  const { country, channel } = req.params;
  const { timeframe, signalTypes } = req.query;

  const result = await LearningService.analyzeMarketTrends(country, channel, {
    timeframe: timeframe as string | undefined,
    signalTypes: signalTypes as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /learning/status
 * Get overall learning system status and statistics.
 */
export const getLearningStatus = asyncHandler(async (_req: Request, res: Response) => {
  const result = await LearningService.getStatus();

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Marketing Models Handlers (7C)
// ===========================================================================

/**
 * POST /models/mmm
 * Run a Marketing Mix Model analysis.
 */
export const runMarketingMixModel = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { channels, country, dateRange, granularity, externalFactors } = req.body;

  const result = await MarketingModelsService.runMarketingMixModel(
    { channels, country, dateRange, granularity, externalFactors },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/bayesian-attribution
 * Run Bayesian attribution analysis across channels.
 */
export const runBayesianAttribution = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { channels, conversionWindow, priors, dateRange } = req.body;

  const result = await MarketingModelsService.runBayesianAttribution(
    { channels, conversionWindow, priors, dateRange },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/econometric
 * Run an econometric model with external variables.
 */
export const runEconometricModel = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { dependentVariable, independentVariables, country, dateRange, modelType } = req.body;

  const result = await MarketingModelsService.runEconometricModel(
    { dependentVariable, independentVariables, country, dateRange, modelType },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/geo-lift
 * Create a geo lift test configuration.
 */
export const createGeoLiftTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, testRegions, controlRegions, channel, duration, budget } = req.body;

  const result = await MarketingModelsService.createGeoLiftTest(
    { name, testRegions, controlRegions, channel, duration, budget },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /models/geo-lift/:testId/results
 * Analyze results of a geo lift test.
 */
export const analyzeGeoLiftResults = asyncHandler(async (req: Request, res: Response) => {
  const { testId } = req.params;

  const result = await MarketingModelsService.analyzeGeoLiftResults(testId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /models/geo-lift
 * List all geo lift tests with optional filters.
 */
export const listGeoLiftTests = asyncHandler(async (req: Request, res: Response) => {
  const { status, page, limit } = req.query;

  const result = await MarketingModelsService.listGeoLiftTests({
    status: status as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * POST /models/brand-lift
 * Create a brand lift survey configuration.
 */
export const createBrandLiftSurvey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, country, channel, questions, sampleSize, duration } = req.body;

  const result = await MarketingModelsService.createBrandLiftSurvey(
    { name, country, channel, questions, sampleSize, duration },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/brand-lift/:surveyId/results
 * Record survey results for a brand lift study.
 */
export const recordBrandLiftResults = asyncHandler(async (req: Request, res: Response) => {
  const { surveyId } = req.params;
  const { responses, metadata } = req.body;

  const result = await MarketingModelsService.recordBrandLiftResults(surveyId, { responses, metadata });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /models/brand-lift/:surveyId/analysis
 * Analyze brand lift survey results.
 */
export const analyzeBrandLift = asyncHandler(async (req: Request, res: Response) => {
  const { surveyId } = req.params;

  const result = await MarketingModelsService.analyzeBrandLift(surveyId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/offline-conversion
 * Record an offline conversion event.
 */
export const recordOfflineConversion = asyncHandler(async (req: Request, res: Response) => {
  const { conversionType, value, attributes, timestamp, source } = req.body;

  const result = await MarketingModelsService.recordOfflineConversion({
    conversionType,
    value,
    attributes,
    timestamp,
    source,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /models/offline-attribution
 * Get offline attribution report matching offline conversions to campaigns.
 */
export const getOfflineAttributionReport = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate, conversionType, channel } = req.query;

  const result = await MarketingModelsService.getOfflineAttributionReport({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    conversionType: conversionType as string | undefined,
    channel: channel as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/saturation-analysis
 * Run a channel saturation analysis.
 */
export const runSaturationAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { channel, country, dateRange, budgetRange } = req.body;

  const result = await MarketingModelsService.runSaturationAnalysis({
    channel,
    country,
    dateRange,
    budgetRange,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /models/diminishing-returns
 * Calculate diminishing returns curve for a channel/country.
 */
export const calculateDiminishingReturns = asyncHandler(async (req: Request, res: Response) => {
  const { channel, country, metric, budgetSteps } = req.body;

  const result = await MarketingModelsService.calculateDiminishingReturns({
    channel,
    country,
    metric,
    budgetSteps,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /models/dashboard
 * Get aggregated marketing models dashboard.
 */
export const getModelsDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const result = await MarketingModelsService.getDashboard();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /models/:modelId
 * Get a specific model by ID with its results.
 */
export const getModelById = asyncHandler(async (req: Request, res: Response) => {
  const { modelId } = req.params;

  const result = await MarketingModelsService.getModelById(modelId);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Strategic Commander Handlers (7D)
// ===========================================================================

/**
 * POST /commander/projection
 * Generate a 30/60/90 day projection based on current data.
 */
export const generateProjection = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { timeframes, channels, countries, assumptions } = req.body;

  const result = await CommanderService.generateProjection(
    { timeframes, channels, countries, assumptions },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /commander/projections
 * Get projection history with optional filters.
 */
export const getProjectionHistory = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, startDate, endDate } = req.query;

  const result = await CommanderService.getProjectionHistory({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /commander/projection/:id/accuracy
 * Compare a projection to actual results for accuracy assessment.
 */
export const getProjectionAccuracy = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await CommanderService.getProjectionAccuracy(id);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/scenarios
 * Generate risk-weighted scenarios for strategic planning.
 */
export const generateScenarios = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { baseAssumptions, riskFactors, numScenarios, constraints } = req.body;

  const result = await CommanderService.generateScenarios(
    { baseAssumptions, riskFactors, numScenarios, constraints },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/scenarios/select
 * Select and activate an optimal scenario.
 */
export const selectOptimalScenario = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { scenarioId, reason } = req.body;

  const result = await CommanderService.selectOptimalScenario(scenarioId, reason, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/challenge
 * Initiate an internal challenge on a strategy or decision.
 */
export const initiateChallenge = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { targetStrategyId, challengeType, parameters } = req.body;

  const result = await CommanderService.initiateChallenge(
    { targetStrategyId, challengeType, parameters },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/devils-advocate
 * Run devil's advocate analysis on a proposed strategy.
 */
export const runDevilsAdvocate = asyncHandler(async (req: Request, res: Response) => {
  const { strategyId, proposal, assumptions } = req.body;

  const result = await CommanderService.runDevilsAdvocate({ strategyId, proposal, assumptions });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /commander/exposure/portfolio
 * Get total portfolio exposure across all countries and channels.
 */
export const getPortfolioExposure = asyncHandler(async (_req: Request, res: Response) => {
  const result = await CommanderService.getPortfolioExposure();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /commander/exposure/country/:country
 * Get exposure breakdown for a specific country.
 */
export const getCountryExposure = asyncHandler(async (req: Request, res: Response) => {
  const { country } = req.params;

  const result = await CommanderService.getCountryExposure(country);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/strategy-comparison
 * Compare conservative vs aggressive strategy approaches.
 */
export const compareStrategies = asyncHandler(async (req: Request, res: Response) => {
  const { strategies, metrics, timeframe, constraints } = req.body;

  const result = await CommanderService.compareStrategies({ strategies, metrics, timeframe, constraints });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/pre-budget-simulation
 * Run a pre-budget simulation to test allocation scenarios.
 */
export const runPreBudgetSimulation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { totalBudget, allocations, constraints, objectives } = req.body;

  const result = await CommanderService.runPreBudgetSimulation(
    { totalBudget, allocations, constraints, objectives },
    userId,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /commander/optimize-budget
 * Optimize budget distribution across channels and countries.
 */
export const optimizeBudget = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { totalBudget, objectives, constraints, channels, countries } = req.body;

  const result = await CommanderService.optimizeBudget(
    { totalBudget, objectives, constraints, channels, countries },
    userId,
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /commander/dashboard
 * Get aggregated strategic commander dashboard.
 */
export const getCommanderDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const result = await CommanderService.getDashboard();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /commander/recommendations
 * Get AI-generated strategic recommendations.
 */
export const getStrategicRecommendations = asyncHandler(async (req: Request, res: Response) => {
  const { country, channel, priority } = req.query;

  const result = await CommanderService.getRecommendations({
    country: country as string | undefined,
    channel: channel as string | undefined,
    priority: priority as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Campaign Health Monitor Handlers (7E)
// ===========================================================================

/**
 * GET /health/campaign/:campaignId
 * Get overall health score for a campaign.
 */
export const getCampaignHealthScore = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await HealthMonitorService.getCampaignHealthScore(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/campaign/:campaignId/cpa-volatility
 * Check CPA volatility for a campaign.
 */
export const getCpaVolatility = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await HealthMonitorService.checkCpaVolatility(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/campaign/:campaignId/spend-velocity
 * Check spend velocity for a campaign.
 */
export const getSpendVelocity = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await HealthMonitorService.checkSpendVelocity(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/campaign/:campaignId/creative-fatigue
 * Get creative fatigue scores for a campaign's creatives.
 */
export const getCampaignCreativeFatigue = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await HealthMonitorService.checkCreativeFatigue(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/campaign/:campaignId/ctr-collapse
 * Check for CTR collapse in a campaign.
 */
export const getCtrCollapse = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await HealthMonitorService.checkCtrCollapse(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/campaign/:campaignId/pixel-signal
 * Check pixel signal quality for a campaign.
 */
export const getPixelSignal = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const result = await HealthMonitorService.checkPixelSignal(campaignId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /health/campaign/:campaignId/full-check
 * Run a full health check across all dimensions for a campaign.
 */
export const runFullHealthCheck = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;
  const { thresholds } = req.body;

  const result = await HealthMonitorService.runFullHealthCheck(campaignId, thresholds);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/dashboard
 * Get aggregated health dashboard across all campaigns.
 */
export const getHealthDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const result = await HealthMonitorService.getDashboard();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/alerts
 * Get all active health alerts.
 */
export const getHealthAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { severity, campaignId, page, limit } = req.query;

  const result = await HealthMonitorService.getAlerts({
    severity: severity as string | undefined,
    campaignId: campaignId as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * POST /health/alerts/:alertId/acknowledge
 * Acknowledge a health alert.
 */
export const acknowledgeHealthAlert = asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const userId = req.user!.id;
  const { note } = req.body;

  const result = await HealthMonitorService.acknowledgeAlert(alertId, userId, note);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/trends
 * Get health trends over time.
 */
export const getHealthTrends = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId, metric, startDate, endDate } = req.query;

  const result = await HealthMonitorService.getHealthTrends({
    campaignId: campaignId as string | undefined,
    metric: metric as string | undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /health/thresholds
 * Set or update health check thresholds.
 */
export const setHealthThresholds = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { thresholds } = req.body;

  const result = await HealthMonitorService.setThresholds(thresholds, userId);

  res.json({
    success: true,
    data: result,
  });
});

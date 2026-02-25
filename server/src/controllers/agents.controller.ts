/**
 * Agents controller -- Express request handlers.
 *
 * Each handler delegates to `AgentsService` and returns a structured JSON
 * envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AgentsService } from '../services/agents.service';
import { generateId } from '../utils/helpers';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /agents
 * List all agents and their current statuses.
 */
export const listAgents = asyncHandler(async (req: Request, res: Response) => {
  const agents = await AgentsService.listAgents();

  res.json({
    success: true,
    data: agents,
  });
});

/**
 * GET /agents/costs
 * Get AI cost tracking summary with optional date range filtering.
 */
export const getCostSummary = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const dateRange = {
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  };

  const summary = await AgentsService.getCostSummary(dateRange);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * GET /agents/costs/:agentType
 * Get AI cost data for a specific agent.
 */
export const getCostByAgent = asyncHandler(async (req: Request, res: Response) => {
  const { agentType } = req.params;
  const { startDate, endDate } = req.query;

  const dateRange = {
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  };

  const detail = await AgentsService.getCostByAgent(agentType, dateRange);

  res.json({
    success: true,
    data: detail,
  });
});

/**
 * GET /agents/challenge/results
 * Get cross-challenge results with pagination.
 */
export const getChallengeResults = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, sortOrder } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortOrder: sortOrder as string | undefined,
  };

  const result = await AgentsService.getChallengeResults(pagination);

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
 * POST /agents/challenge/run
 * Trigger a cross-challenge cycle between agents.
 */
export const runChallengeRound = asyncHandler(async (req: Request, res: Response) => {
  const { agentTypes } = req.body;

  const round = await AgentsService.runChallengeRound(agentTypes);

  res.status(201).json({
    success: true,
    data: round,
  });
});

/**
 * POST /agents/orchestrate
 * Trigger a master orchestrator cycle.
 */
export const runOrchestration = asyncHandler(async (req: Request, res: Response) => {
  const requestId = generateId();

  const result = await AgentsService.runOrchestration(requestId);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /agents/:agentType
 * Retrieve the current status of a specific agent.
 */
export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const agent = await AgentsService.getAgent(req.params.agentType);

  res.json({
    success: true,
    data: agent,
  });
});

/**
 * POST /agents/:agentType/run
 * Trigger an agent to run with optional parameters.
 */
export const runAgent = asyncHandler(async (req: Request, res: Response) => {
  const { agentType } = req.params;
  const { parameters } = req.body;

  const output = await AgentsService.runAgent(agentType, parameters);

  res.status(201).json({
    success: true,
    data: output,
  });
});

/**
 * POST /agents/:agentType/pause
 * Pause an agent to prevent it from being scheduled.
 */
export const pauseAgent = asyncHandler(async (req: Request, res: Response) => {
  await AgentsService.pauseAgent(req.params.agentType);

  res.json({
    success: true,
    data: { message: `Agent "${req.params.agentType}" paused successfully` },
  });
});

/**
 * POST /agents/:agentType/resume
 * Resume a paused agent.
 */
export const resumeAgent = asyncHandler(async (req: Request, res: Response) => {
  await AgentsService.resumeAgent(req.params.agentType);

  res.json({
    success: true,
    data: { message: `Agent "${req.params.agentType}" resumed successfully` },
  });
});

/**
 * GET /agents/:agentType/decisions
 * Get paginated decision history for a specific agent.
 */
export const getDecisions = asyncHandler(async (req: Request, res: Response) => {
  const { agentType } = req.params;
  const { page, limit, sortBy, sortOrder } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as string | undefined,
  };

  const result = await AgentsService.getDecisions(agentType, pagination);

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
 * GET /agents/:agentType/decisions/:decisionId
 * Retrieve a specific agent decision by ID.
 */
export const getDecision = asyncHandler(async (req: Request, res: Response) => {
  const decision = await AgentsService.getDecision(req.params.decisionId);

  res.json({
    success: true,
    data: decision,
  });
});

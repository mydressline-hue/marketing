/**
 * Agents router.
 *
 * Mounts all agent-related endpoints with authentication, permission
 * checks, and request validation middleware. Read endpoints require at
 * least analyst-level access (read:agents), while write/run endpoints
 * require admin privileges (write:agents).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateQuery } from '../middleware/validation';
import { paginationSchema } from '../validators/schemas';
import {
  listAgents,
  getAgent,
  runAgent,
  pauseAgent,
  resumeAgent,
  getDecisions,
  getDecision,
  runOrchestration,
  getChallengeResults,
  runChallengeRound,
  getCostSummary,
  getCostByAgent,
} from '../controllers/agents.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Static / non-parameterised routes (must be before /:agentType)
// ---------------------------------------------------------------------------

// GET /agents -- list all agents and their statuses
router.get(
  '/',
  authenticate,
  requirePermission('read:agents'),
  listAgents,
);

// POST /agents/orchestrate -- trigger master orchestrator cycle
router.post(
  '/orchestrate',
  authenticate,
  requirePermission('write:agents'),
  runOrchestration,
);

// GET /agents/challenge/results -- get cross-challenge results
router.get(
  '/challenge/results',
  authenticate,
  requirePermission('read:agents'),
  validateQuery(paginationSchema),
  getChallengeResults,
);

// POST /agents/challenge/run -- trigger a cross-challenge cycle
router.post(
  '/challenge/run',
  authenticate,
  requirePermission('write:agents'),
  runChallengeRound,
);

// GET /agents/costs -- get AI cost tracking summary
router.get(
  '/costs',
  authenticate,
  requirePermission('read:agents'),
  getCostSummary,
);

// GET /agents/costs/:agentType -- get costs for specific agent
router.get(
  '/costs/:agentType',
  authenticate,
  requirePermission('read:agents'),
  getCostByAgent,
);

// ---------------------------------------------------------------------------
// Parameterised routes (/:agentType)
// ---------------------------------------------------------------------------

// GET /agents/:agentType -- get specific agent status
router.get(
  '/:agentType',
  authenticate,
  requirePermission('read:agents'),
  getAgent,
);

// POST /agents/:agentType/run -- trigger an agent to run
router.post(
  '/:agentType/run',
  authenticate,
  requirePermission('write:agents'),
  runAgent,
);

// POST /agents/:agentType/pause -- pause an agent
router.post(
  '/:agentType/pause',
  authenticate,
  requirePermission('write:agents'),
  pauseAgent,
);

// POST /agents/:agentType/resume -- resume an agent
router.post(
  '/:agentType/resume',
  authenticate,
  requirePermission('write:agents'),
  resumeAgent,
);

// GET /agents/:agentType/decisions -- get agent decisions (paginated)
router.get(
  '/:agentType/decisions',
  authenticate,
  requirePermission('read:agents'),
  validateQuery(paginationSchema),
  getDecisions,
);

// GET /agents/:agentType/decisions/:decisionId -- get specific decision
router.get(
  '/:agentType/decisions/:decisionId',
  authenticate,
  requirePermission('read:agents'),
  getDecision,
);

export default router;

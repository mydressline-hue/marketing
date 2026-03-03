/**
 * Kill Switch & Governance controllers -- Express request handlers.
 *
 * Handlers delegate to KillSwitchService, AutomatedTriggersService, and
 * GovernanceService, returning structured JSON envelopes:
 * `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { KillSwitchService, OperationType } from '../services/killswitch/KillSwitchService';
import { GovernanceService, ApprovalRequest } from '../services/governance/GovernanceService';
import type { DateRange } from '../types';

// ===========================================================================
// Kill Switch Handlers
// ===========================================================================

/**
 * POST /killswitch/activate
 * Activate the kill switch at the specified level.
 */
export const activateKillSwitch = asyncHandler(async (req: Request, res: Response) => {
  const { level, reason } = req.body;
  const userId = req.user!.id;

  const result = await KillSwitchService.activateGlobalKillSwitch(userId, level, reason);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /killswitch/:id/deactivate
 * Deactivate a specific kill switch by ID.
 */
export const deactivateKillSwitch = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const result = await KillSwitchService.deactivateKillSwitch(id, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /killswitch/status
 * Get current kill switch status including all active switches.
 */
export const getKillSwitchStatus = asyncHandler(async (_req: Request, res: Response) => {
  const result = await KillSwitchService.getActiveKillSwitches();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /killswitch/level
 * Get the current highest active kill switch level.
 */
export const getKillSwitchLevel = asyncHandler(async (_req: Request, res: Response) => {
  const result = await KillSwitchService.getCurrentLevel();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /killswitch/history
 * Get kill switch activation/deactivation history.
 */
export const getKillSwitchHistory = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  };

  const result = await KillSwitchService.getKillSwitchHistory(pagination);

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
 * POST /killswitch/campaign/:id/pause
 * Pause a specific campaign via the kill switch.
 */
export const pauseCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { reason } = req.body;

  const result = await KillSwitchService.pauseCampaign(id, userId, reason);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /killswitch/campaign/:id/resume
 * Resume a paused campaign.
 */
export const resumeCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const result = await KillSwitchService.resumeCampaign(id, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /killswitch/country/:id/pause
 * Pause all operations for a specific country.
 */
export const pauseCountry = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { reason } = req.body;

  const result = await KillSwitchService.pauseCountry(id, userId, reason);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /killswitch/country/:id/resume
 * Resume operations for a paused country.
 */
export const resumeCountry = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const result = await KillSwitchService.resumeCountry(id, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /killswitch/automation/pause
 * Pause all automated operations.
 */
export const pauseAutomation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { reason } = req.body;

  const result = await KillSwitchService.pauseAutomation(userId, reason);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /killswitch/api-keys/lock
 * Lock all API keys to prevent external service access.
 */
export const lockApiKeys = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { reason } = req.body;

  const result = await KillSwitchService.lockAPIKeys(userId, reason);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /killswitch/check
 * Check if a specific operation is allowed under current kill switch state.
 */
export const checkOperation = asyncHandler(async (req: Request, res: Response) => {
  const { operation, context } = req.query;

  let parsedContext = {};
  if (context) {
    try {
      parsedContext = JSON.parse(context as string);
    } catch {
      res.status(400).json({
        success: false,
        error: 'Invalid JSON in context query parameter',
      });
      return;
    }
  }

  const result = await KillSwitchService.isOperationAllowed(
    operation as OperationType,
    parsedContext,
  );

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Governance Handlers
// ===========================================================================

/**
 * POST /governance/assess-risk/:decisionId
 * Assess the risk level of a specific decision.
 */
export const assessRisk = asyncHandler(async (req: Request, res: Response) => {
  const { decisionId } = req.params;

  const result = await GovernanceService.assessRisk(decisionId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /governance/gate-confidence
 * Check whether a decision meets the confidence gate threshold.
 */
export const gateConfidence = asyncHandler(async (req: Request, res: Response) => {
  const { confidence_score, decision_type, context } = req.body;

  const result = await GovernanceService.gateConfidence({
    confidence_score,
    decision_type,
    context,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /governance/validate-strategy/:decisionId
 * Validate a strategy decision against governance rules.
 */
export const validateStrategy = asyncHandler(async (req: Request, res: Response) => {
  const { decisionId } = req.params;

  const result = await GovernanceService.validateStrategy(decisionId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /governance/approvals
 * Get the pending approval queue.
 */
export const getApprovals = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, status } = req.query;

  const filters = {
    status: status as ApprovalRequest['status'] | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  };

  const result = await GovernanceService.getApprovals(filters);

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
 * POST /governance/approvals/:id/resolve
 * Resolve a pending approval (approve or reject).
 */
export const resolveApproval = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { action, reason } = req.body;

  const approved = action === 'approved' || action === 'approve';
  const result = await GovernanceService.resolveApproval(id, userId, approved, reason);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /governance/override/:decisionId
 * Apply a manual override to a governance-blocked decision.
 */
export const manualOverride = asyncHandler(async (req: Request, res: Response) => {
  const { decisionId } = req.params;
  const userId = req.user!.id;
  const { reason, override_action } = req.body;

  const result = await GovernanceService.manualOverride(decisionId, userId, reason, override_action);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /governance/policy
 * Get the current governance policy configuration.
 */
export const getPolicy = asyncHandler(async (_req: Request, res: Response) => {
  const result = await GovernanceService.getPolicy();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * PUT /governance/policy
 * Update the governance policy configuration.
 */
export const updatePolicy = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const policyUpdate = req.body;

  const result = await GovernanceService.updatePolicy(policyUpdate, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /governance/metrics
 * Get governance metrics and statistics.
 */
export const getGovernanceMetrics = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const dateRange: DateRange | undefined =
    startDate && endDate
      ? { startDate: startDate as string, endDate: endDate as string }
      : undefined;

  const result = await GovernanceService.getMetrics(dateRange);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /governance/audit-trail/:decisionId
 * Get the full audit trail for a specific decision.
 */
export const getAuditTrail = asyncHandler(async (req: Request, res: Response) => {
  const { decisionId } = req.params;

  const result = await GovernanceService.getAuditTrail(decisionId);

  res.json({
    success: true,
    data: result,
  });
});

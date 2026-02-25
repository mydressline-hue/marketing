/**
 * Kill Switch & Governance routes.
 *
 * Mounts all kill-switch and governance endpoints with authentication and
 * permission middleware. Read endpoints require at least viewer-level access
 * (read:killswitch / read:governance), while write/mutate endpoints require
 * admin privileges (write:killswitch / write:governance). Campaign-level
 * pause/resume requires campaign_manager or above (write:campaigns).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  activateKillSwitch,
  deactivateKillSwitch,
  getKillSwitchStatus,
  getKillSwitchLevel,
  getKillSwitchHistory,
  pauseCampaign,
  resumeCampaign,
  pauseCountry,
  resumeCountry,
  pauseAutomation,
  lockApiKeys,
  checkOperation,
} from '../controllers/killswitch.controller';
import {
  assessRisk,
  gateConfidence,
  validateStrategy,
  getApprovals,
  resolveApproval,
  manualOverride,
  getPolicy,
  updatePolicy,
  getGovernanceMetrics,
  getAuditTrail,
} from '../controllers/killswitch.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Kill Switch routes (prefix: /killswitch)
// ---------------------------------------------------------------------------

// POST /killswitch/activate -- activate kill switch (admin only)
router.post(
  '/killswitch/activate',
  requirePermission('write:killswitch'),
  activateKillSwitch,
);

// POST /killswitch/:id/deactivate -- deactivate kill switch (admin only)
router.post(
  '/killswitch/:id/deactivate',
  requirePermission('write:killswitch'),
  deactivateKillSwitch,
);

// GET /killswitch/status -- get current kill switch status (viewer+)
router.get(
  '/killswitch/status',
  requirePermission('read:killswitch'),
  getKillSwitchStatus,
);

// GET /killswitch/level -- get current highest level (viewer+)
router.get(
  '/killswitch/level',
  requirePermission('read:killswitch'),
  getKillSwitchLevel,
);

// GET /killswitch/history -- get kill switch history (viewer+)
router.get(
  '/killswitch/history',
  requirePermission('read:killswitch'),
  getKillSwitchHistory,
);

// POST /killswitch/campaign/:id/pause -- pause campaign (campaign_manager+)
router.post(
  '/killswitch/campaign/:id/pause',
  requirePermission('write:campaigns'),
  pauseCampaign,
);

// POST /killswitch/campaign/:id/resume -- resume campaign (campaign_manager+)
router.post(
  '/killswitch/campaign/:id/resume',
  requirePermission('write:campaigns'),
  resumeCampaign,
);

// POST /killswitch/country/:id/pause -- pause country (admin only)
router.post(
  '/killswitch/country/:id/pause',
  requirePermission('write:killswitch'),
  pauseCountry,
);

// POST /killswitch/country/:id/resume -- resume country (admin only)
router.post(
  '/killswitch/country/:id/resume',
  requirePermission('write:killswitch'),
  resumeCountry,
);

// POST /killswitch/automation/pause -- pause automation (admin only)
router.post(
  '/killswitch/automation/pause',
  requirePermission('write:killswitch'),
  pauseAutomation,
);

// POST /killswitch/api-keys/lock -- lock API keys (admin only)
router.post(
  '/killswitch/api-keys/lock',
  requirePermission('write:killswitch'),
  lockApiKeys,
);

// GET /killswitch/check -- check if operation is allowed (viewer+)
router.get(
  '/killswitch/check',
  requirePermission('read:killswitch'),
  checkOperation,
);

// ---------------------------------------------------------------------------
// Governance routes (prefix: /governance)
// ---------------------------------------------------------------------------

// POST /governance/assess-risk/:decisionId -- assess risk for decision (admin)
router.post(
  '/governance/assess-risk/:decisionId',
  requirePermission('write:governance'),
  assessRisk,
);

// POST /governance/gate-confidence -- check confidence gate (viewer+)
router.post(
  '/governance/gate-confidence',
  requirePermission('read:governance'),
  gateConfidence,
);

// POST /governance/validate-strategy/:decisionId -- validate strategy (admin)
router.post(
  '/governance/validate-strategy/:decisionId',
  requirePermission('write:governance'),
  validateStrategy,
);

// GET /governance/approvals -- get approval queue (viewer+)
router.get(
  '/governance/approvals',
  requirePermission('read:governance'),
  getApprovals,
);

// POST /governance/approvals/:id/resolve -- resolve approval (admin)
router.post(
  '/governance/approvals/:id/resolve',
  requirePermission('write:governance'),
  resolveApproval,
);

// POST /governance/override/:decisionId -- manual override (admin)
router.post(
  '/governance/override/:decisionId',
  requirePermission('write:governance'),
  manualOverride,
);

// GET /governance/policy -- get governance policy (viewer+)
router.get(
  '/governance/policy',
  requirePermission('read:governance'),
  getPolicy,
);

// PUT /governance/policy -- update governance policy (admin)
router.put(
  '/governance/policy',
  requirePermission('write:governance'),
  updatePolicy,
);

// GET /governance/metrics -- get governance metrics (viewer+)
router.get(
  '/governance/metrics',
  requirePermission('read:governance'),
  getGovernanceMetrics,
);

// GET /governance/audit-trail/:decisionId -- get decision audit trail (viewer+)
router.get(
  '/governance/audit-trail/:decisionId',
  requirePermission('read:governance'),
  getAuditTrail,
);

export default router;

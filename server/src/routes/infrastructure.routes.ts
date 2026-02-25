/**
 * Infrastructure routes (Phase 6).
 *
 * Mounts monitoring, data-quality, security, observability and system
 * endpoints with authentication and role-based access control.
 *
 * Read endpoints require at least viewer-level access (read:infrastructure),
 * while write/mutate endpoints require admin privileges
 * (write:infrastructure). Campaign-manager-level users can acknowledge
 * and resolve alerts (write:campaigns).
 *
 * The public health check endpoint does NOT require authentication.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  // Monitoring
  getSpendMonitoring,
  getAnomalies,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getAlertHistory,
  updateAlertConfig,
  getMonitoringDashboard,
  // Data Quality
  getDataQualityReport,
  validateTableSchema,
  getDataLineage,
  detectPii,
  anonymizePii,
  getUserConsent,
  manageConsent,
  // Security
  rotateKeys,
  getEncryptionStatus,
  getIpWhitelist,
  addToIpWhitelist,
  removeFromIpWhitelist,
  runThreatScan,
  getSoc2Readiness,
  getSecurityReport,
  // Observability
  getTrace,
  getErrorDashboard,
  getConfidenceDrift,
  getLogRetention,
  updateLogRetention,
  enforceLogRetention,
  // System
  healthCheck,
  detailedHealthCheck,
  getFailoverState,
  enterDegradedMode,
  attemptRecovery,
  initiateBackup,
  getBackupHistory,
} from '../controllers/infrastructure.controller';

const router = Router();

// ---------------------------------------------------------------------------
// System routes -- public health check (no auth required)
// ---------------------------------------------------------------------------

// GET /system/health -- public health check (no auth)
router.get('/system/health', healthCheck);

// ---------------------------------------------------------------------------
// All remaining routes require authentication
// ---------------------------------------------------------------------------

router.use(authenticate);

// ---------------------------------------------------------------------------
// Monitoring routes (prefix: /monitoring)
// ---------------------------------------------------------------------------

// GET /monitoring/spend -- get spend monitoring data (viewer+)
router.get(
  '/monitoring/spend',
  requirePermission('read:infrastructure'),
  getSpendMonitoring,
);

// GET /monitoring/anomalies -- get detected anomalies (viewer+)
router.get(
  '/monitoring/anomalies',
  requirePermission('read:infrastructure'),
  getAnomalies,
);

// GET /monitoring/alerts -- get active alerts (viewer+)
router.get(
  '/monitoring/alerts',
  requirePermission('read:infrastructure'),
  getAlerts,
);

// POST /monitoring/alerts/:id/acknowledge -- acknowledge alert (campaign_manager+)
router.post(
  '/monitoring/alerts/:id/acknowledge',
  requirePermission('write:campaigns'),
  acknowledgeAlert,
);

// POST /monitoring/alerts/:id/resolve -- resolve alert (campaign_manager+)
router.post(
  '/monitoring/alerts/:id/resolve',
  requirePermission('write:campaigns'),
  resolveAlert,
);

// GET /monitoring/alerts/history -- get alert history (viewer+)
router.get(
  '/monitoring/alerts/history',
  requirePermission('read:infrastructure'),
  getAlertHistory,
);

// PUT /monitoring/alerts/config -- update alert configuration (admin)
router.put(
  '/monitoring/alerts/config',
  requirePermission('write:infrastructure'),
  updateAlertConfig,
);

// GET /monitoring/dashboard -- get monitoring dashboard (viewer+)
router.get(
  '/monitoring/dashboard',
  requirePermission('read:infrastructure'),
  getMonitoringDashboard,
);

// ---------------------------------------------------------------------------
// Data Quality routes (prefix: /data-quality)
// ---------------------------------------------------------------------------

// GET /data-quality/report -- get data quality report (viewer+)
router.get(
  '/data-quality/report',
  requirePermission('read:infrastructure'),
  getDataQualityReport,
);

// POST /data-quality/validate/:table -- validate table schema (admin)
router.post(
  '/data-quality/validate/:table',
  requirePermission('write:infrastructure'),
  validateTableSchema,
);

// GET /data-quality/lineage/:table -- get data lineage (viewer+)
router.get(
  '/data-quality/lineage/:table',
  requirePermission('read:infrastructure'),
  getDataLineage,
);

// GET /data-quality/pii -- detect PII fields (admin)
router.get(
  '/data-quality/pii',
  requirePermission('write:infrastructure'),
  detectPii,
);

// POST /data-quality/anonymize -- anonymize PII (admin)
router.post(
  '/data-quality/anonymize',
  requirePermission('write:infrastructure'),
  anonymizePii,
);

// GET /data-quality/consent/:userId -- get user consent status (admin)
router.get(
  '/data-quality/consent/:userId',
  requirePermission('write:infrastructure'),
  getUserConsent,
);

// POST /data-quality/consent -- manage consent (admin)
router.post(
  '/data-quality/consent',
  requirePermission('write:infrastructure'),
  manageConsent,
);

// ---------------------------------------------------------------------------
// Security routes (prefix: /security)
// ---------------------------------------------------------------------------

// POST /security/rotate-keys -- rotate API keys (admin)
router.post(
  '/security/rotate-keys',
  requirePermission('write:infrastructure'),
  rotateKeys,
);

// GET /security/encryption-status -- get encryption status (admin)
router.get(
  '/security/encryption-status',
  requirePermission('write:infrastructure'),
  getEncryptionStatus,
);

// GET /security/ip-whitelist -- get IP whitelist (admin)
router.get(
  '/security/ip-whitelist',
  requirePermission('write:infrastructure'),
  getIpWhitelist,
);

// POST /security/ip-whitelist -- add to whitelist (admin)
router.post(
  '/security/ip-whitelist',
  requirePermission('write:infrastructure'),
  addToIpWhitelist,
);

// DELETE /security/ip-whitelist/:id -- remove from whitelist (admin)
router.delete(
  '/security/ip-whitelist/:id',
  requirePermission('write:infrastructure'),
  removeFromIpWhitelist,
);

// POST /security/scan -- run threat scan (admin)
router.post(
  '/security/scan',
  requirePermission('write:infrastructure'),
  runThreatScan,
);

// GET /security/soc2 -- get SOC2 readiness (admin)
router.get(
  '/security/soc2',
  requirePermission('write:infrastructure'),
  getSoc2Readiness,
);

// GET /security/report -- get security report (admin)
router.get(
  '/security/report',
  requirePermission('write:infrastructure'),
  getSecurityReport,
);

// ---------------------------------------------------------------------------
// Observability routes (prefix: /observability)
// ---------------------------------------------------------------------------

// GET /observability/trace/:traceId -- get trace (viewer+)
router.get(
  '/observability/trace/:traceId',
  requirePermission('read:infrastructure'),
  getTrace,
);

// GET /observability/errors -- get error dashboard (viewer+)
router.get(
  '/observability/errors',
  requirePermission('read:infrastructure'),
  getErrorDashboard,
);

// GET /observability/confidence-drift -- get confidence drift report (viewer+)
router.get(
  '/observability/confidence-drift',
  requirePermission('read:infrastructure'),
  getConfidenceDrift,
);

// GET /observability/log-retention -- get retention policies (admin)
router.get(
  '/observability/log-retention',
  requirePermission('write:infrastructure'),
  getLogRetention,
);

// PUT /observability/log-retention -- update retention policy (admin)
router.put(
  '/observability/log-retention',
  requirePermission('write:infrastructure'),
  updateLogRetention,
);

// POST /observability/log-retention/enforce -- enforce retention (admin)
router.post(
  '/observability/log-retention/enforce',
  requirePermission('write:infrastructure'),
  enforceLogRetention,
);

// ---------------------------------------------------------------------------
// System routes (prefix: /system) -- authenticated
// ---------------------------------------------------------------------------

// GET /system/health/detailed -- detailed health check (admin)
router.get(
  '/system/health/detailed',
  requirePermission('write:infrastructure'),
  detailedHealthCheck,
);

// GET /system/failover -- get failover state (admin)
router.get(
  '/system/failover',
  requirePermission('write:infrastructure'),
  getFailoverState,
);

// POST /system/failover/degraded -- enter degraded mode (admin)
router.post(
  '/system/failover/degraded',
  requirePermission('write:infrastructure'),
  enterDegradedMode,
);

// POST /system/failover/recover -- attempt recovery (admin)
router.post(
  '/system/failover/recover',
  requirePermission('write:infrastructure'),
  attemptRecovery,
);

// POST /system/backup -- initiate backup (admin)
router.post(
  '/system/backup',
  requirePermission('write:infrastructure'),
  initiateBackup,
);

// GET /system/backups -- get backup history (admin)
router.get(
  '/system/backups',
  requirePermission('write:infrastructure'),
  getBackupHistory,
);

export default router;

/**
 * Infrastructure controllers -- Express request handlers (Phase 6).
 *
 * Handlers delegate to MonitoringService, DataQualityService,
 * SecurityHardeningService, ObservabilityService, and FailoverService,
 * returning structured JSON envelopes: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { MonitoringService } from '../services/monitoring/MonitoringService';
import { DataQualityService } from '../services/dataquality/DataQualityService';
import { SecurityHardeningService } from '../services/security/SecurityHardeningService';
import { ObservabilityService } from '../services/observability/ObservabilityService';
import { FailoverService } from '../services/failover/FailoverService';

// ===========================================================================
// Monitoring Handlers
// ===========================================================================

/**
 * GET /monitoring/spend
 * Get spend monitoring data with optional date range filters.
 */
export const getSpendMonitoring = asyncHandler(async (req: Request, res: Response) => {
  const { startDate: _startDate, endDate: _endDate, country: _country, channel: _channel } = req.query;

  const result = await MonitoringService.getSpendMonitoring();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /monitoring/anomalies
 * Get detected anomalies across spend, performance, and system metrics.
 */
export const getAnomalies = asyncHandler(async (_req: Request, res: Response) => {
  const result = await MonitoringService.getAnomalies();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /monitoring/alerts
 * Get active alerts.
 */
export const getAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { severity, page, limit } = req.query;

  const result = await MonitoringService.getAlerts({
    severity: severity as string | undefined,
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
 * POST /monitoring/alerts/:id/acknowledge
 * Acknowledge an alert.
 */
export const acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const result = await MonitoringService.acknowledgeAlert(id, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /monitoring/alerts/:id/resolve
 * Resolve an alert.
 */
export const resolveAlert = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { resolution } = req.body;

  const result = await MonitoringService.resolveAlert(id, userId, resolution);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /monitoring/alerts/history
 * Get alert history with optional filters.
 */
export const getAlertHistory = asyncHandler(async (req: Request, res: Response) => {
  const { severity, page, limit } = req.query;

  const result = await MonitoringService.getAlertHistory({
    severity: severity as string | undefined,
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
 * PUT /monitoring/alerts/config
 * Update alert configuration (thresholds, recipients, etc.).
 */
export const updateAlertConfig = asyncHandler(async (req: Request, res: Response) => {
  const _userId = req.user!.id;
  const configUpdate = req.body;

  const result = await MonitoringService.updateAlertConfig(configUpdate);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /monitoring/dashboard
 * Get aggregated monitoring dashboard data.
 */
export const getMonitoringDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const result = await MonitoringService.getDashboard();

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Data Quality Handlers
// ===========================================================================

/**
 * GET /data-quality/report
 * Get data quality report with scores and issues.
 */
export const getDataQualityReport = asyncHandler(async (_req: Request, res: Response) => {
  const result = await DataQualityService.getReport();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /data-quality/validate/:table
 * Validate a specific table's schema against expected definitions.
 */
export const validateTableSchema = asyncHandler(async (req: Request, res: Response) => {
  const { table } = req.params;

  const result = await DataQualityService.validateSchema(table);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /data-quality/lineage/:table
 * Get data lineage for a specific table.
 */
export const getDataLineage = asyncHandler(async (req: Request, res: Response) => {
  const { table } = req.params;

  const result = await DataQualityService.getLineage(table);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /data-quality/pii
 * Detect PII fields across all tables.
 */
export const detectPii = asyncHandler(async (_req: Request, res: Response) => {
  const result = await DataQualityService.detectPii();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /data-quality/anonymize
 * Anonymize PII data in specified tables/fields.
 */
export const anonymizePii = asyncHandler(async (req: Request, res: Response) => {
  const { table, columns } = req.body;

  const result = await DataQualityService.anonymizePii(table, columns);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /data-quality/consent/:userId
 * Get user consent status for data processing.
 */
export const getUserConsent = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const result = await DataQualityService.getConsent(userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /data-quality/consent
 * Manage consent records (create/update).
 */
export const manageConsent = asyncHandler(async (req: Request, res: Response) => {
  const { userId, consentType, granted, regulation } = req.body;

  const result = await DataQualityService.manageConsent(userId, consentType, granted, regulation);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Security Handlers
// ===========================================================================

/**
 * POST /security/rotate-keys
 * Rotate API keys for specified services.
 */
export const rotateKeys = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { services, reason } = req.body;

  const result = await SecurityHardeningService.rotateKeys({ services, reason }, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /security/encryption-status
 * Get encryption status across all data stores.
 */
export const getEncryptionStatus = asyncHandler(async (_req: Request, res: Response) => {
  const result = await SecurityHardeningService.getEncryptionStatus();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /security/ip-whitelist
 * Get current IP whitelist entries.
 */
export const getIpWhitelist = asyncHandler(async (_req: Request, res: Response) => {
  const result = await SecurityHardeningService.getIpWhitelist();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /security/ip-whitelist
 * Add an IP address or CIDR to the whitelist.
 */
export const addToIpWhitelist = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { ip, description } = req.body;

  const result = await SecurityHardeningService.addToWhitelist({ ip, description }, userId);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * DELETE /security/ip-whitelist/:id
 * Remove an IP entry from the whitelist.
 */
export const removeFromIpWhitelist = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  await SecurityHardeningService.removeFromWhitelist(id, userId);

  res.status(204).send();
});

/**
 * POST /security/scan
 * Run a threat scan across the system.
 */
export const runThreatScan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { scanType, targets } = req.body;

  const result = await SecurityHardeningService.runThreatScan({ scanType, targets }, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /security/soc2
 * Get SOC2 compliance readiness report.
 */
export const getSoc2Readiness = asyncHandler(async (_req: Request, res: Response) => {
  const result = await SecurityHardeningService.getSoc2Readiness();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /security/report
 * Get comprehensive security report.
 */
export const getSecurityReport = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const result = await SecurityHardeningService.getSecurityReport({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Observability Handlers
// ===========================================================================

/**
 * GET /observability/trace/:traceId
 * Get a specific distributed trace by ID.
 */
export const getTrace = asyncHandler(async (req: Request, res: Response) => {
  const { traceId } = req.params;

  const result = await ObservabilityService.getTrace(traceId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /observability/errors
 * Get error dashboard with aggregated error data.
 */
export const getErrorDashboard = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate, severity } = req.query;

  const result = await ObservabilityService.getErrorDashboard({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    severity: severity as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /observability/confidence-drift
 * Get confidence drift report showing changes over time.
 */
export const getConfidenceDrift = asyncHandler(async (req: Request, res: Response) => {
  const { agentType, startDate, endDate } = req.query;

  const result = await ObservabilityService.getConfidenceDrift({
    agentType: agentType as string | undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /observability/log-retention
 * Get current log retention policies.
 */
export const getLogRetention = asyncHandler(async (_req: Request, res: Response) => {
  const result = await ObservabilityService.getLogRetention();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * PUT /observability/log-retention
 * Update a log retention policy.
 */
export const updateLogRetention = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const policyUpdate = req.body;

  const result = await ObservabilityService.updateLogRetention(policyUpdate, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /observability/log-retention/enforce
 * Enforce retention policies now (purge expired data).
 */
export const enforceLogRetention = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const result = await ObservabilityService.enforceLogRetention(userId);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// System Handlers
// ===========================================================================

/**
 * GET /system/health
 * Public health check -- no authentication required.
 */
export const healthCheck = asyncHandler(async (_req: Request, res: Response) => {
  const result = await FailoverService.healthCheck();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /system/health/detailed
 * Detailed health check with subsystem statuses (admin only).
 */
export const detailedHealthCheck = asyncHandler(async (_req: Request, res: Response) => {
  const result = await FailoverService.detailedHealthCheck();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /system/failover
 * Get current failover state and circuit-breaker statuses.
 */
export const getFailoverState = asyncHandler(async (_req: Request, res: Response) => {
  const result = await FailoverService.getFailoverState();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /system/failover/degraded
 * Enter degraded mode (disable non-critical subsystems).
 */
export const enterDegradedMode = asyncHandler(async (req: Request, res: Response) => {
  const { reason, services } = req.body;

  const result = await FailoverService.enterDegradedMode(services, reason);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /system/failover/recover
 * Attempt to recover from degraded or failed state.
 */
export const attemptRecovery = asyncHandler(async (req: Request, res: Response) => {
  const { services } = req.body;

  const result = await FailoverService.attemptRecovery(services);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /system/backup
 * Initiate a system backup.
 */
export const initiateBackup = asyncHandler(async (req: Request, res: Response) => {
  const { type, tables } = req.body;

  const result = await FailoverService.initiateBackup(type, tables);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /system/backups
 * Get backup history.
 */
export const getBackupHistory = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query;

  const allBackups = await FailoverService.getBackupHistory();

  const pageNum = page ? parseInt(page as string, 10) : 1;
  const limitNum = limit ? parseInt(limit as string, 10) : 20;
  const total = allBackups.length;
  const totalPages = Math.ceil(total / limitNum);
  const start = (pageNum - 1) * limitNum;
  const data = allBackups.slice(start, start + limitNum);

  res.json({
    success: true,
    data,
    meta: {
      total,
      page: pageNum,
      totalPages,
    },
  });
});

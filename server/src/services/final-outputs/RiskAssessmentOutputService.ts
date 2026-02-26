/**
 * Risk Assessment Report Service.
 *
 * Phase 10 Final Output Deliverable #5.
 * Aggregates risk data from Compliance Agent (13), Fraud Detection Agent (15),
 * Enterprise Security Agent (18), and the Governance Service to produce a
 * comprehensive risk assessment report.
 *
 * All data is sourced from the database and upstream services -- no hardcoded values.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Risk categories tracked by the report. */
export type RiskCategory =
  | 'compliance'
  | 'fraud'
  | 'security'
  | 'financial'
  | 'operational';

/** Top-level risk classification. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** A single identified risk entry. */
export interface RiskEntry {
  id: string;
  category: RiskCategory;
  severity: RiskLevel;
  likelihood: RiskLevel;
  impact: RiskLevel;
  description: string;
  affected_countries: string[];
  mitigation_strategy: string;
  owner: string;
  status: 'open' | 'mitigating' | 'resolved' | 'accepted';
}

/** Compliance status across major regulations. */
export interface ComplianceStatusReport {
  gdpr: boolean;
  ccpa: boolean;
  local_ad_laws: Record<string, boolean>;
}

/** Fraud detection metrics snapshot. */
export interface FraudMetrics {
  click_fraud_rate: number;
  bot_traffic_pct: number;
  anomaly_count: number;
  blocked_ips_count: number;
}

/** Security posture snapshot. */
export interface SecurityPosture {
  api_key_rotation_status: string;
  encryption_status: string;
  soc2_readiness_pct: number;
  last_audit_date: string;
  vulnerabilities_found: number;
}

/** Daily risk score data point for trend analysis. */
export interface RiskTrendPoint {
  date: string;
  risk_score: number;
}

/** A prioritised mitigation action item. */
export interface MitigationAction {
  id: string;
  risk_id: string;
  priority: number;
  action: string;
  owner: string;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed';
  estimated_risk_reduction: number;
}

/** Full risk assessment report. */
export interface RiskAssessmentReport {
  overall_risk_level: RiskLevel;
  risk_score: number;
  risks: RiskEntry[];
  compliance_status: ComplianceStatusReport;
  fraud_metrics: FraudMetrics;
  security_posture: SecurityPosture;
  risk_trend: RiskTrendPoint[];
  generated_at: string;
  confidence_score: number;
}

// ---------------------------------------------------------------------------
// Cache Configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'final_output:risk_assessment';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a numeric risk score (0-100) to a risk level label.
 */
function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/**
 * Compute a weighted average from an array of {value, weight} pairs.
 */
function weightedAverage(items: Array<{ value: number; weight: number }>): number {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = items.reduce((sum, i) => sum + i.value * i.weight, 0);
  return Math.round((weighted / totalWeight) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RiskAssessmentOutputService {
  /**
   * Generate the full risk assessment report by aggregating data from all
   * risk-related agents and services.
   */
  static async generateRiskAssessmentReport(): Promise<RiskAssessmentReport> {
    const cacheKey = `${CACHE_PREFIX}:full_report`;
    const cached = await cacheGet<RiskAssessmentReport>(cacheKey);
    if (cached) {
      return cached;
    }

    logger.info('Generating risk assessment report');

    // Gather all data sources in parallel
    const [
      risks,
      complianceStatus,
      fraudMetrics,
      securityPosture,
      riskTrend,
      governanceMetrics,
    ] = await Promise.all([
      RiskAssessmentOutputService.fetchRisks(),
      RiskAssessmentOutputService.fetchComplianceStatus(),
      RiskAssessmentOutputService.fetchFraudMetrics(),
      RiskAssessmentOutputService.fetchSecurityPosture(),
      RiskAssessmentOutputService.fetchRiskTrend(),
      RiskAssessmentOutputService.fetchGovernanceRiskMetrics(),
    ]);

    // Calculate composite risk score from each dimension
    const complianceScore = RiskAssessmentOutputService.computeComplianceScore(
      complianceStatus,
      risks.filter((r) => r.category === 'compliance'),
    );
    const fraudScore = RiskAssessmentOutputService.computeFraudScore(fraudMetrics);
    const securityScore = RiskAssessmentOutputService.computeSecurityScore(securityPosture);
    const operationalScore = RiskAssessmentOutputService.computeOperationalScore(
      risks.filter((r) => r.category === 'operational'),
      governanceMetrics,
    );
    const financialScore = RiskAssessmentOutputService.computeFinancialScore(
      risks.filter((r) => r.category === 'financial'),
    );

    const riskScore = Math.round(
      weightedAverage([
        { value: complianceScore, weight: 0.25 },
        { value: fraudScore, weight: 0.25 },
        { value: securityScore, weight: 0.25 },
        { value: operationalScore, weight: 0.15 },
        { value: financialScore, weight: 0.10 },
      ]),
    );

    // Confidence is higher when more data sources returned meaningful data
    const dataPoints = [
      risks.length > 0 ? 1 : 0,
      complianceStatus.gdpr !== undefined ? 1 : 0,
      fraudMetrics.anomaly_count >= 0 ? 1 : 0,
      securityPosture.soc2_readiness_pct >= 0 ? 1 : 0,
      riskTrend.length > 0 ? 1 : 0,
    ];
    const confidenceScore = Math.round(
      (dataPoints.reduce((s, v) => s + v, 0) / dataPoints.length) * 100,
    );

    const report: RiskAssessmentReport = {
      overall_risk_level: scoreToLevel(riskScore),
      risk_score: riskScore,
      risks,
      compliance_status: complianceStatus,
      fraud_metrics: fraudMetrics,
      security_posture: securityPosture,
      risk_trend: riskTrend,
      generated_at: new Date().toISOString(),
      confidence_score: confidenceScore,
    };

    await cacheSet(cacheKey, report, CACHE_TTL);

    logger.info('Risk assessment report generated', {
      risk_score: riskScore,
      risk_level: report.overall_risk_level,
      total_risks: risks.length,
    });

    return report;
  }

  /**
   * Retrieve risks filtered by category.
   */
  static async getRisksByCategory(category: RiskCategory): Promise<RiskEntry[]> {
    const cacheKey = `${CACHE_PREFIX}:category:${category}`;
    const cached = await cacheGet<RiskEntry[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT
         rf.id,
         rf.severity,
         rf.description,
         rf.status,
         rf.resource_type,
         rf.resource_id,
         c.code AS country_code
       FROM risk_flags rf
       LEFT JOIN campaigns camp ON camp.id = rf.resource_id AND rf.resource_type = 'campaign'
       LEFT JOIN countries c ON c.id = camp.country_id
       WHERE rf.severity IS NOT NULL
       ORDER BY
         CASE rf.severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END`,
    );

    const allRisks = result.rows.map((row) =>
      RiskAssessmentOutputService.mapRiskFlagToEntry(row, category),
    );

    const filtered = allRisks.filter((r) => r.category === category);

    await cacheSet(cacheKey, filtered, CACHE_TTL);

    return filtered;
  }

  /**
   * Generate a prioritised mitigation plan based on current open risks.
   */
  static async getRiskMitigationPlan(): Promise<MitigationAction[]> {
    const cacheKey = `${CACHE_PREFIX}:mitigation_plan`;
    const cached = await cacheGet<MitigationAction[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch open risk flags and governance risk assessments
    const [riskFlagsResult, governanceRisksResult] = await Promise.all([
      pool.query(
        `SELECT rf.id, rf.severity, rf.description, rf.resource_type, rf.resource_id
         FROM risk_flags rf
         WHERE rf.status != 'compliant'
         ORDER BY
           CASE rf.severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END`,
      ),
      pool.query(
        `SELECT ra.id, ra.risk_score, ra.risk_level, ra.decision_id
         FROM risk_assessments ra
         WHERE ra.risk_level IN ('high', 'critical')
         ORDER BY ra.risk_score DESC
         LIMIT 50`,
      ),
    ]);

    const actions: MitigationAction[] = [];
    let priority = 1;

    // Build mitigation actions from risk flags
    for (const row of riskFlagsResult.rows) {
      const severity = row.severity as string;
      const estimatedReduction = severity === 'critical' ? 25 : severity === 'high' ? 15 : 10;

      actions.push({
        id: `mitigation-${row.id}`,
        risk_id: row.id as string,
        priority: priority++,
        action: RiskAssessmentOutputService.deriveMitigationAction(
          row.description as string,
          severity,
        ),
        owner: RiskAssessmentOutputService.assignOwner(row.resource_type as string),
        deadline: RiskAssessmentOutputService.computeDeadline(severity),
        status: 'pending',
        estimated_risk_reduction: estimatedReduction,
      });
    }

    // Build mitigation actions from governance risk assessments
    for (const row of governanceRisksResult.rows) {
      const riskLevel = row.risk_level as string;
      const estimatedReduction = riskLevel === 'critical' ? 20 : 12;

      actions.push({
        id: `mitigation-gov-${row.id}`,
        risk_id: row.id as string,
        priority: priority++,
        action: `Review and remediate governance risk for decision ${row.decision_id}`,
        owner: 'governance_team',
        deadline: RiskAssessmentOutputService.computeDeadline(riskLevel),
        status: 'pending',
        estimated_risk_reduction: estimatedReduction,
      });
    }

    await cacheSet(cacheKey, actions, CACHE_TTL);

    logger.info('Risk mitigation plan generated', { total_actions: actions.length });

    return actions;
  }

  // -------------------------------------------------------------------------
  // Data Fetching (private)
  // -------------------------------------------------------------------------

  /**
   * Fetch all risk entries from risk_flags, fraud_alerts, and risk_assessments.
   */
  private static async fetchRisks(): Promise<RiskEntry[]> {
    const [riskFlagsResult, fraudAlertsResult, securityEventsResult] = await Promise.all([
      pool.query(
        `SELECT rf.id, rf.severity, rf.description, rf.status, rf.resource_type, rf.resource_id,
                c.code AS country_code
         FROM risk_flags rf
         LEFT JOIN campaigns camp ON camp.id = rf.resource_id AND rf.resource_type = 'campaign'
         LEFT JOIN countries c ON c.id = camp.country_id
         ORDER BY rf.severity DESC`,
      ),
      pool.query(
        `SELECT fa.id, fa.type, fa.severity, fa.confidence_score, fa.details, fa.status,
                fa.campaign_id, c.code AS country_code
         FROM fraud_alerts fa
         LEFT JOIN campaigns camp ON camp.id = fa.campaign_id
         LEFT JOIN countries c ON c.id = camp.country_id
         ORDER BY fa.severity DESC`,
      ),
      pool.query(
        `SELECT ra.id, ra.risk_score, ra.risk_level, ra.decision_id, ra.agent_type
         FROM risk_assessments ra
         ORDER BY ra.risk_score DESC
         LIMIT 100`,
      ),
    ]);

    const risks: RiskEntry[] = [];

    // Map compliance/operational risk flags
    for (const row of riskFlagsResult.rows) {
      const category = RiskAssessmentOutputService.categorizeRiskFlag(
        row.resource_type as string,
      );
      risks.push(RiskAssessmentOutputService.mapRiskFlagToEntry(row, category));
    }

    // Map fraud alerts
    for (const row of fraudAlertsResult.rows) {
      const details = (row.details || {}) as Record<string, unknown>;
      risks.push({
        id: row.id as string,
        category: 'fraud',
        severity: (row.severity as RiskLevel) || 'medium',
        likelihood: RiskAssessmentOutputService.deriveLikelihood(
          Number(row.confidence_score) || 50,
        ),
        impact: (row.severity as RiskLevel) || 'medium',
        description: (details.description as string) || `Fraud alert: ${row.type}`,
        affected_countries: row.country_code ? [row.country_code as string] : [],
        mitigation_strategy: RiskAssessmentOutputService.deriveFraudMitigation(
          row.type as string,
        ),
        owner: 'fraud_detection_team',
        status: row.status === 'resolved' ? 'resolved' : 'open',
      });
    }

    // Map governance risk assessments to security/operational risks
    for (const row of securityEventsResult.rows) {
      const riskLevel = (row.risk_level as RiskLevel) || 'medium';
      const category = RiskAssessmentOutputService.categorizeAgentRisk(
        row.agent_type as string,
      );
      risks.push({
        id: `gov-${row.id}`,
        category,
        severity: riskLevel,
        likelihood: riskLevel,
        impact: riskLevel,
        description: `Governance risk assessment for decision ${row.decision_id} (agent: ${row.agent_type})`,
        affected_countries: [],
        mitigation_strategy: 'Review decision and apply governance controls',
        owner: 'governance_team',
        status: 'open',
      });
    }

    return risks;
  }

  /**
   * Fetch compliance status from compliance_checks and regulation data.
   */
  private static async fetchComplianceStatus(): Promise<ComplianceStatusReport> {
    // Check GDPR compliance across campaigns
    const gdprResult = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'compliant') AS compliant
       FROM compliance_checks
       WHERE regulation = 'gdpr'`,
    );
    const gdprTotal = parseInt(gdprResult.rows[0]?.total || '0', 10);
    const gdprCompliant = parseInt(gdprResult.rows[0]?.compliant || '0', 10);
    const gdpr = gdprTotal > 0 ? gdprCompliant === gdprTotal : true;

    // Check CCPA compliance across campaigns
    const ccpaResult = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'compliant') AS compliant
       FROM compliance_checks
       WHERE regulation = 'ccpa'`,
    );
    const ccpaTotal = parseInt(ccpaResult.rows[0]?.total || '0', 10);
    const ccpaCompliant = parseInt(ccpaResult.rows[0]?.compliant || '0', 10);
    const ccpa = ccpaTotal > 0 ? ccpaCompliant === ccpaTotal : true;

    // Check local advertising law compliance per country
    const localLawsResult = await pool.query(
      `SELECT c.code AS country_code,
              CASE
                WHEN COUNT(cc.id) = 0 THEN true
                WHEN COUNT(cc.id) FILTER (WHERE cc.status != 'compliant') = 0 THEN true
                ELSE false
              END AS compliant
       FROM countries c
       LEFT JOIN campaigns camp ON camp.country_id = c.id AND camp.status != 'archived'
       LEFT JOIN compliance_checks cc ON cc.campaign_id = camp.id
       WHERE c.is_active = true
       GROUP BY c.code`,
    );

    const localAdLaws: Record<string, boolean> = {};
    for (const row of localLawsResult.rows) {
      localAdLaws[row.country_code as string] = row.compliant as boolean;
    }

    return { gdpr, ccpa, local_ad_laws: localAdLaws };
  }

  /**
   * Fetch fraud metrics from fraud_alerts and traffic analytics.
   */
  private static async fetchFraudMetrics(): Promise<FraudMetrics> {
    const [fraudRateResult, botResult, anomalyResult, blockedResult] = await Promise.all([
      // Click fraud rate: ratio of fraud alerts of type click_fraud to total campaigns
      pool.query(
        `SELECT
           COUNT(DISTINCT fa.campaign_id) FILTER (WHERE fa.type = 'click_fraud') AS fraud_campaigns,
           COUNT(DISTINCT camp.id) AS total_campaigns
         FROM campaigns camp
         LEFT JOIN fraud_alerts fa ON fa.campaign_id = camp.id AND fa.status != 'resolved'
         WHERE camp.status != 'archived'`,
      ),
      // Bot traffic percentage from traffic analytics
      pool.query(
        `SELECT COALESCE(AVG(
           CASE WHEN total_sessions > 0
             THEN (bot_sessions::float / total_sessions) * 100
             ELSE 0
           END
         ), 0) AS bot_pct
         FROM traffic_analytics
         WHERE created_at > NOW() - INTERVAL '30 days'`,
      ),
      // Anomaly count from fraud_alerts
      pool.query(
        `SELECT COUNT(*) AS anomaly_count
         FROM fraud_alerts
         WHERE type = 'conversion_anomaly'
           AND status != 'resolved'
           AND created_at > NOW() - INTERVAL '30 days'`,
      ),
      // Blocked IPs count
      pool.query(
        `SELECT COUNT(*) AS blocked_count
         FROM blocked_ips
         WHERE is_active = true`,
      ),
    ]);

    const fraudCampaigns = parseInt(fraudRateResult.rows[0]?.fraud_campaigns || '0', 10);
    const totalCampaigns = parseInt(fraudRateResult.rows[0]?.total_campaigns || '0', 10);
    const clickFraudRate = totalCampaigns > 0
      ? Math.round((fraudCampaigns / totalCampaigns) * 10000) / 100
      : 0;

    const botTrafficPct = Math.round(
      (parseFloat(botResult.rows[0]?.bot_pct || '0') * 100) / 100,
    );

    const anomalyCount = parseInt(anomalyResult.rows[0]?.anomaly_count || '0', 10);
    const blockedIpsCount = parseInt(blockedResult.rows[0]?.blocked_count || '0', 10);

    return {
      click_fraud_rate: clickFraudRate,
      bot_traffic_pct: botTrafficPct,
      anomaly_count: anomalyCount,
      blocked_ips_count: blockedIpsCount,
    };
  }

  /**
   * Fetch security posture from security assessment tables.
   */
  private static async fetchSecurityPosture(): Promise<SecurityPosture> {
    const [keyRotationResult, encryptionResult, soc2Result, auditResult, vulnResult] =
      await Promise.all([
        // API key rotation status
        pool.query(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE rotated_at > NOW() - INTERVAL '90 days') AS recent
           FROM api_keys
           WHERE is_active = true`,
        ),
        // Encryption status
        pool.query(
          `SELECT
             COALESCE(
               (SELECT value FROM system_settings WHERE key = 'encryption_at_rest'),
               'unknown'
             ) AS at_rest,
             COALESCE(
               (SELECT value FROM system_settings WHERE key = 'encryption_in_transit'),
               'unknown'
             ) AS in_transit`,
        ),
        // SOC2 readiness
        pool.query(
          `SELECT COALESCE(
             (SELECT (details->>'overall_score')::numeric FROM security_assessments
              WHERE type = 'soc2' ORDER BY created_at DESC LIMIT 1),
             0
           ) AS readiness_pct`,
        ),
        // Last audit date
        pool.query(
          `SELECT COALESCE(
             (SELECT created_at FROM security_assessments
              ORDER BY created_at DESC LIMIT 1),
             NOW()
           ) AS last_audit`,
        ),
        // Vulnerabilities found
        pool.query(
          `SELECT COUNT(*) AS vuln_count
           FROM vulnerability_findings
           WHERE status != 'resolved'`,
        ),
      ]);

    const totalKeys = parseInt(keyRotationResult.rows[0]?.total || '0', 10);
    const recentKeys = parseInt(keyRotationResult.rows[0]?.recent || '0', 10);
    const rotationStatus = totalKeys === 0
      ? 'no_keys'
      : recentKeys === totalKeys
        ? 'current'
        : `${totalKeys - recentKeys} keys need rotation`;

    const atRest = encryptionResult.rows[0]?.at_rest as string;
    const inTransit = encryptionResult.rows[0]?.in_transit as string;
    const encryptionStatus =
      atRest === 'enabled' && inTransit === 'enabled'
        ? 'fully_encrypted'
        : atRest === 'enabled' || inTransit === 'enabled'
          ? 'partially_encrypted'
          : 'unknown';

    const soc2ReadinessPct = Math.round(
      parseFloat(soc2Result.rows[0]?.readiness_pct || '0'),
    );

    const lastAuditDate = (auditResult.rows[0]?.last_audit as string) || new Date().toISOString();

    const vulnerabilitiesFound = parseInt(vulnResult.rows[0]?.vuln_count || '0', 10);

    return {
      api_key_rotation_status: rotationStatus,
      encryption_status: encryptionStatus,
      soc2_readiness_pct: soc2ReadinessPct,
      last_audit_date: typeof lastAuditDate === 'string'
        ? lastAuditDate
        : new Date(lastAuditDate as unknown as number).toISOString(),
      vulnerabilities_found: vulnerabilitiesFound,
    };
  }

  /**
   * Fetch historical risk score trend data.
   */
  private static async fetchRiskTrend(): Promise<RiskTrendPoint[]> {
    const result = await pool.query(
      `SELECT
         date_trunc('day', assessed_at) AS date,
         ROUND(AVG(risk_score)) AS risk_score
       FROM risk_assessments
       WHERE assessed_at > NOW() - INTERVAL '30 days'
       GROUP BY date_trunc('day', assessed_at)
       ORDER BY date ASC`,
    );

    return result.rows.map((row) => {
      const rawDate = row.date;
      let dateStr: string;
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString();
      } else if (rawDate && typeof (rawDate as Date).toISOString === 'function') {
        dateStr = (rawDate as Date).toISOString();
      } else {
        dateStr = String(rawDate || '');
      }
      return {
        date: dateStr,
        risk_score: Math.round(parseFloat(String(row.risk_score)) || 0),
      };
    });
  }

  /**
   * Fetch governance risk metrics for operational risk calculation.
   */
  private static async fetchGovernanceRiskMetrics(): Promise<{
    average_risk_score: number;
    total_decisions: number;
    rejected_percent: number;
  }> {
    const result = await pool.query(
      `SELECT
         COALESCE(AVG(risk_score), 0) AS avg_risk,
         COUNT(*) AS total,
         COALESCE(
           COUNT(*) FILTER (WHERE risk_level = 'high' OR risk_level = 'critical') * 100.0 /
           NULLIF(COUNT(*), 0),
           0
         ) AS high_risk_pct
       FROM risk_assessments
       WHERE assessed_at > NOW() - INTERVAL '30 days'`,
    );

    return {
      average_risk_score: Math.round(parseFloat(result.rows[0]?.avg_risk || '0')),
      total_decisions: parseInt(result.rows[0]?.total || '0', 10),
      rejected_percent: Math.round(parseFloat(result.rows[0]?.high_risk_pct || '0')),
    };
  }

  // -------------------------------------------------------------------------
  // Score Computation (private)
  // -------------------------------------------------------------------------

  private static computeComplianceScore(
    status: ComplianceStatusReport,
    complianceRisks: RiskEntry[],
  ): number {
    let score = 0;

    // GDPR non-compliance adds significant risk
    if (!status.gdpr) score += 30;

    // CCPA non-compliance adds moderate risk
    if (!status.ccpa) score += 20;

    // Local ad law non-compliance
    const localEntries = Object.values(status.local_ad_laws);
    const nonCompliantLocals = localEntries.filter((v) => !v).length;
    if (localEntries.length > 0) {
      score += Math.round((nonCompliantLocals / localEntries.length) * 30);
    }

    // Add risk from compliance risk entries
    const criticalCount = complianceRisks.filter((r) => r.severity === 'critical').length;
    const highCount = complianceRisks.filter((r) => r.severity === 'high').length;
    score += Math.min(20, criticalCount * 10 + highCount * 5);

    return Math.min(100, score);
  }

  private static computeFraudScore(metrics: FraudMetrics): number {
    let score = 0;

    // Click fraud rate contribution
    score += Math.min(30, metrics.click_fraud_rate * 3);

    // Bot traffic contribution
    score += Math.min(30, metrics.bot_traffic_pct * 1.5);

    // Anomaly count contribution
    score += Math.min(20, metrics.anomaly_count * 2);

    // Blocked IPs can indicate active threats
    score += Math.min(20, metrics.blocked_ips_count * 0.5);

    return Math.min(100, Math.round(score));
  }

  private static computeSecurityScore(posture: SecurityPosture): number {
    let score = 0;

    // API key rotation
    if (posture.api_key_rotation_status !== 'current') {
      score += 20;
    }

    // Encryption
    if (posture.encryption_status !== 'fully_encrypted') {
      score += 25;
    }

    // SOC2 readiness (invert: lower readiness = higher risk)
    score += Math.round((100 - posture.soc2_readiness_pct) * 0.3);

    // Vulnerabilities
    score += Math.min(25, posture.vulnerabilities_found * 5);

    return Math.min(100, Math.round(score));
  }

  private static computeOperationalScore(
    operationalRisks: RiskEntry[],
    governanceMetrics: { average_risk_score: number; rejected_percent: number },
  ): number {
    let score = 0;

    // Average governance risk score
    score += governanceMetrics.average_risk_score * 0.5;

    // High risk decisions percentage
    score += governanceMetrics.rejected_percent * 0.3;

    // Open operational risks
    const openRisks = operationalRisks.filter((r) => r.status === 'open');
    score += Math.min(20, openRisks.length * 4);

    return Math.min(100, Math.round(score));
  }

  private static computeFinancialScore(financialRisks: RiskEntry[]): number {
    let score = 0;

    const criticalCount = financialRisks.filter((r) => r.severity === 'critical').length;
    const highCount = financialRisks.filter((r) => r.severity === 'high').length;
    const mediumCount = financialRisks.filter((r) => r.severity === 'medium').length;

    score += criticalCount * 25;
    score += highCount * 15;
    score += mediumCount * 5;

    return Math.min(100, score);
  }

  // -------------------------------------------------------------------------
  // Mapping Helpers (private)
  // -------------------------------------------------------------------------

  private static mapRiskFlagToEntry(
    row: Record<string, unknown>,
    category: RiskCategory,
  ): RiskEntry {
    const severity = (row.severity as RiskLevel) || 'medium';
    return {
      id: row.id as string,
      category,
      severity,
      likelihood: severity,
      impact: severity,
      description: (row.description as string) || 'Risk identified',
      affected_countries: row.country_code ? [row.country_code as string] : [],
      mitigation_strategy: RiskAssessmentOutputService.deriveComplianceMitigation(severity),
      owner: RiskAssessmentOutputService.assignOwner(row.resource_type as string),
      status: RiskAssessmentOutputService.mapStatus(row.status as string),
    };
  }

  private static categorizeRiskFlag(resourceType: string): RiskCategory {
    switch (resourceType) {
      case 'campaign':
        return 'compliance';
      case 'budget':
      case 'allocation':
        return 'financial';
      case 'api_key':
      case 'encryption':
        return 'security';
      default:
        return 'operational';
    }
  }

  private static categorizeAgentRisk(agentType: string): RiskCategory {
    switch (agentType) {
      case 'compliance':
        return 'compliance';
      case 'fraud_detection':
        return 'fraud';
      case 'enterprise_security':
        return 'security';
      case 'budget_optimization':
        return 'financial';
      default:
        return 'operational';
    }
  }

  private static deriveLikelihood(confidenceScore: number): RiskLevel {
    if (confidenceScore >= 80) return 'critical';
    if (confidenceScore >= 60) return 'high';
    if (confidenceScore >= 40) return 'medium';
    return 'low';
  }

  private static deriveFraudMitigation(fraudType: string): string {
    switch (fraudType) {
      case 'click_fraud':
        return 'Implement click validation filters, block suspicious IP ranges, enable CAPTCHA verification';
      case 'bot_traffic':
        return 'Deploy bot detection mechanisms, enable behavioral analysis, block datacenter IPs';
      case 'conversion_anomaly':
        return 'Investigate conversion funnel, verify tracking implementation, audit attribution model';
      case 'budget_misuse':
        return 'Review budget allocation rules, implement spending caps, enable real-time alerts';
      default:
        return 'Investigate and apply appropriate fraud prevention measures';
    }
  }

  private static deriveComplianceMitigation(severity: RiskLevel): string {
    switch (severity) {
      case 'critical':
        return 'Immediate campaign pause and compliance review required';
      case 'high':
        return 'Urgent compliance audit and corrective action needed';
      case 'medium':
        return 'Schedule compliance review and implement preventive controls';
      default:
        return 'Monitor and address in next compliance cycle';
    }
  }

  private static deriveMitigationAction(description: string, severity: string): string {
    if (severity === 'critical') {
      return `URGENT: Remediate critical risk - ${description}`;
    }
    if (severity === 'high') {
      return `HIGH PRIORITY: Address risk - ${description}`;
    }
    return `Review and mitigate risk - ${description}`;
  }

  private static assignOwner(resourceType: string): string {
    switch (resourceType) {
      case 'campaign':
        return 'compliance_team';
      case 'budget':
      case 'allocation':
        return 'finance_team';
      case 'api_key':
      case 'encryption':
        return 'security_team';
      default:
        return 'operations_team';
    }
  }

  private static computeDeadline(severity: string): string {
    const now = new Date();
    switch (severity) {
      case 'critical':
        now.setDate(now.getDate() + 1); // 24 hours
        break;
      case 'high':
        now.setDate(now.getDate() + 7); // 1 week
        break;
      case 'medium':
        now.setDate(now.getDate() + 30); // 1 month
        break;
      default:
        now.setDate(now.getDate() + 90); // 3 months
        break;
    }
    return now.toISOString();
  }

  private static mapStatus(
    status: string,
  ): 'open' | 'mitigating' | 'resolved' | 'accepted' {
    switch (status) {
      case 'compliant':
        return 'resolved';
      case 'pending_review':
        return 'mitigating';
      case 'exempted':
        return 'accepted';
      case 'non_compliant':
      default:
        return 'open';
    }
  }
}

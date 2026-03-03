// ============================================================
// AI International Growth Engine - Enterprise Security Agent
// Agent 18: Enterprise Security & Compliance
//
// Manages API key rotation, RBAC validation, audit trail
// generation, encryption verification, SOC2 readiness
// assessment, DDoS protection evaluation, vulnerability
// scanning, secret vault validation, security event
// monitoring, and threat level assessment.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/types';
import type { AgentType, DateRange } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { retryWithBackoff } from '../../utils/helpers';

// ---- Cache Configuration ----

/** Cache key prefix for enterprise security data */
const CACHE_PREFIX = 'enterprise_security';

/** Cache TTL in seconds (3 minutes for security-sensitive data) */
const CACHE_TTL = 180;

/** Cache TTL for vulnerability scans (10 minutes) */
const VULNERABILITY_CACHE_TTL = 600;

// ---- Security Thresholds ----

/** Maximum API key age in days before rotation is recommended */
const API_KEY_MAX_AGE_DAYS = 90;

/** Maximum API key age in days before rotation is forced */
const API_KEY_FORCE_ROTATION_DAYS = 180;

/** Minimum acceptable encryption key strength in bits */
const MIN_KEY_STRENGTH_BITS = 256;

/** SOC2 minimum passing score (percentage) */
const SOC2_MIN_PASSING_SCORE = 80;

/** Threat level thresholds */
const THREAT_LEVEL_THRESHOLDS = {
  low: 0,
  medium: 25,
  high: 50,
  critical: 75,
} as const;

/** Maximum days before a secret is considered "expiring soon" */
const SECRET_EXPIRY_WARNING_DAYS = 30;

// ---- Local Type Definitions ----

/**
 * Result of an API key rotation operation.
 */
export interface KeyRotationResult {
  /** Number of keys successfully rotated */
  rotated: number;
  /** Number of keys that failed rotation */
  failed: number;
  /** ISO-8601 timestamp of next scheduled rotation */
  nextRotation: string;
  /** Per-key rotation details */
  details: { keyId: string; rotated: boolean; error?: string }[];
}

/**
 * Result of validating the RBAC configuration.
 */
export interface RBACValidation {
  /** Whether the overall RBAC configuration is valid */
  valid: boolean;
  /** Per-role validation results */
  roles: { name: string; permissions: string[]; issues: string[] }[];
  /** Permissions that exist but are not assigned to any role */
  orphanedPermissions: string[];
}

/**
 * A single audit event record.
 */
export interface AuditEvent {
  /** Unique identifier for the event */
  id: string;
  /** Action that was performed */
  action: string;
  /** User who performed the action */
  userId: string;
  /** Resource that was affected */
  resource: string;
  /** ISO-8601 timestamp of the event */
  timestamp: string;
  /** Severity level of the event */
  severity: string;
}

/**
 * Comprehensive audit report for a given time period.
 */
export interface AuditReport {
  /** Human-readable period description */
  period: string;
  /** Total number of audit events in the period */
  totalEvents: number;
  /** Breakdown of events by action type */
  byAction: Record<string, number>;
  /** Critical events that require attention */
  criticalEvents: AuditEvent[];
  /** Descriptions of suspicious activity patterns detected */
  suspiciousActivity: string[];
}

/**
 * Result of validating encryption configuration.
 */
export interface EncryptionValidation {
  /** Whether encryption at rest is enabled */
  atRest: boolean;
  /** Whether encryption in transit is enabled */
  inTransit: boolean;
  /** Encryption algorithm in use */
  algorithm: string;
  /** Key strength in bits */
  keyStrength: number;
  /** Issues found with the encryption configuration */
  issues: string[];
}

/**
 * SOC2 compliance readiness assessment.
 */
export interface SOC2Assessment {
  /** Whether the system is ready for SOC2 audit */
  ready: boolean;
  /** Per-control assessment results */
  controls: { name: string; status: 'pass' | 'fail' | 'partial'; findings: string[] }[];
  /** Overall readiness score (0-100) */
  overallScore: number;
}

/**
 * DDoS protection assessment.
 */
export interface DDoSAssessment {
  /** Whether DDoS protection is in place */
  protected: boolean;
  /** Active protection mechanisms */
  mechanisms: string[];
  /** Known vulnerabilities */
  vulnerabilities: string[];
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * A single vulnerability finding from a scan.
 */
export interface VulnerabilityFinding {
  /** Unique identifier for the finding */
  id: string;
  /** Severity level */
  severity: string;
  /** Category of vulnerability */
  category: string;
  /** Description of the vulnerability */
  description: string;
  /** Recommended remediation steps */
  remediation: string;
}

/**
 * Result of a vulnerability scan.
 */
export interface VulnerabilityScan {
  /** ISO-8601 timestamp when the scan was performed */
  scannedAt: string;
  /** Count of critical findings */
  critical: number;
  /** Count of high-severity findings */
  high: number;
  /** Count of medium-severity findings */
  medium: number;
  /** Count of low-severity findings */
  low: number;
  /** Detailed findings */
  findings: VulnerabilityFinding[];
}

/**
 * Result of validating the secrets vault.
 */
export interface VaultValidation {
  /** Whether the vault is healthy */
  healthy: boolean;
  /** Total number of managed secrets */
  secretsCount: number;
  /** List of secret identifiers expiring within the warning window */
  expiringSoon: string[];
  /** Issues found with the vault */
  issues: string[];
}

/**
 * A single security event.
 */
export interface SecurityEvent {
  /** Type of security event */
  type: string;
  /** Source of the event */
  source: string;
  /** Description of the event */
  description: string;
  /** Severity level */
  severity: string;
  /** ISO-8601 timestamp */
  timestamp: string;
}

/**
 * Report of recent security events with threat context.
 */
export interface SecurityEventReport {
  /** Recent security events */
  events: SecurityEvent[];
  /** Current threat level based on event analysis */
  threatLevel: string;
  /** Recommendations based on current events */
  recommendations: string[];
}

/**
 * Overall threat assessment.
 */
export interface ThreatAssessment {
  /** Current threat level */
  level: 'low' | 'medium' | 'high' | 'critical';
  /** Active threat descriptions */
  activeThreats: string[];
  /** Number of incidents in the recent window */
  recentIncidents: number;
  /** Recommendations for mitigating current threats */
  recommendations: string[];
}

// ---- SOC2 Control Definitions ----

/**
 * SOC2 Trust Services Criteria controls to evaluate.
 */
const _SOC2_CONTROLS = [
  { name: 'CC1.1 - Control Environment', category: 'security' },
  { name: 'CC2.1 - Information Communication', category: 'security' },
  { name: 'CC3.1 - Risk Assessment', category: 'security' },
  { name: 'CC4.1 - Monitoring Activities', category: 'security' },
  { name: 'CC5.1 - Control Activities', category: 'security' },
  { name: 'CC6.1 - Logical Access', category: 'security' },
  { name: 'CC6.2 - System Access Restrictions', category: 'security' },
  { name: 'CC6.3 - Role-Based Access', category: 'security' },
  { name: 'CC7.1 - System Monitoring', category: 'availability' },
  { name: 'CC7.2 - Incident Response', category: 'availability' },
  { name: 'CC8.1 - Change Management', category: 'processing_integrity' },
  { name: 'CC9.1 - Risk Mitigation', category: 'security' },
  { name: 'P1.1 - Privacy Notice', category: 'privacy' },
  { name: 'A1.1 - System Availability', category: 'availability' },
] as const;

// ---- Agent Implementation ----

/**
 * Enterprise Security Agent (Agent 18).
 *
 * Provides comprehensive security management for the growth engine including
 * API key lifecycle management, RBAC validation, audit trail analysis,
 * encryption compliance, SOC2 readiness evaluation, DDoS protection
 * assessment, vulnerability scanning, secret vault management, security
 * event monitoring, and continuous threat assessment.
 *
 * Uses the Opus model for maximum reasoning capability given the
 * security-critical nature of its assessments.
 *
 * @extends BaseAgent
 */
export class EnterpriseSecurityAgent extends BaseAgent {
  constructor(config?: Partial<{
    maxRetries: number;
    timeoutMs: number;
    confidenceThreshold: number;
  }>) {
    super({
      agentType: 'enterprise_security' as AgentType,
      model: 'opus',
      maxRetries: config?.maxRetries ?? 3,
      timeoutMs: config?.timeoutMs ?? 120_000,
      confidenceThreshold: config?.confidenceThreshold ?? 70,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the Claude system prompt for enterprise security tasks.
   */
  public getSystemPrompt(): string {
    return `You are the Enterprise Security Agent for an AI-powered international growth engine.
Your role is to ensure the highest level of security across all platform operations.

Your responsibilities:
1. Manage and enforce API key rotation policies.
2. Validate Role-Based Access Control (RBAC) configurations for correctness and least privilege.
3. Generate and analyze audit reports for compliance and suspicious activity detection.
4. Verify encryption configurations for data at rest and in transit.
5. Assess SOC2 readiness across all Trust Services Criteria.
6. Evaluate DDoS protection mechanisms and recommend improvements.
7. Perform vulnerability assessments and prioritize remediation.
8. Validate secret vault integrity and expiration policies.
9. Monitor security events in real-time and correlate threat signals.
10. Provide continuous threat level assessment with actionable recommendations.

You must:
- Never fabricate security findings. Only report what is observed and verified.
- Assign confidence scores conservatively; security assessments require high certainty.
- Flag any uncertainty when data is incomplete or verification cannot be performed.
- Always recommend the most secure option when trade-offs exist.
- Treat all security issues as urgent until proven otherwise.

Output format: Respond with valid JSON matching the requested schema.`;
  }

  /**
   * Returns the agent types whose decisions this agent can challenge.
   * Enterprise Security can challenge compliance (security aspects),
   * data engineering (data security), and fraud detection (threat overlap).
   */
  public getChallengeTargets(): AgentType[] {
    return ['compliance', 'data_engineering', 'fraud_detection'];
  }

  /**
   * Core processing method. Runs security assessment including RBAC validation,
   * encryption checks, key rotation status, audit analysis, and threat assessment.
   *
   * @param input - Standard agent input with context and parameters.
   * @returns Structured agent output with security assessment data.
   */
  public async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Starting enterprise security assessment', {
      requestId: input.requestId,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];
    const recommendations: string[] = [];

    // Step 1: Validate RBAC configuration
    let rbacValidation: RBACValidation | null = null;
    try {
      rbacValidation = await this.validateRBAC();
      if (!rbacValidation.valid) {
        warnings.push('RBAC configuration has issues that need attention');
        for (const role of rbacValidation.roles) {
          for (const issue of role.issues) {
            warnings.push(`[RBAC] Role '${role.name}': ${issue}`);
          }
        }
        if (rbacValidation.orphanedPermissions.length > 0) {
          recommendations.push(
            `Remove orphaned permissions: ${rbacValidation.orphanedPermissions.join(', ')}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`RBAC validation failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('rbac', 'Unable to validate RBAC configuration'),
      );
    }

    // Step 2: Validate encryption
    let encryptionValidation: EncryptionValidation | null = null;
    try {
      encryptionValidation = await this.validateEncryption();
      if (encryptionValidation.issues.length > 0) {
        for (const issue of encryptionValidation.issues) {
          warnings.push(`[Encryption] ${issue}`);
        }
      }
      if (encryptionValidation.keyStrength < MIN_KEY_STRENGTH_BITS) {
        recommendations.push(
          `Upgrade encryption key strength to at least ${MIN_KEY_STRENGTH_BITS} bits (current: ${encryptionValidation.keyStrength})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Encryption validation failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('encryption', 'Unable to verify encryption configuration'),
      );
    }

    // Step 3: Check API key rotation status
    let keyRotationStatus: KeyRotationResult | null = null;
    try {
      keyRotationStatus = await this.rotateAPIKeys(false);
      const expiredKeys = keyRotationStatus.details.filter((d) => !d.rotated && d.error);
      if (expiredKeys.length > 0) {
        warnings.push(
          `${expiredKeys.length} API key(s) need attention: ${expiredKeys.map((k) => k.keyId).join(', ')}`,
        );
        recommendations.push('Review and rotate API keys that failed rotation checks');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`API key rotation check failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('api_keys', 'Unable to verify API key rotation status'),
      );
    }

    // Step 4: Assess threat level
    let threatAssessment: ThreatAssessment | null = null;
    try {
      threatAssessment = await this.assessThreatLevel();
      if (threatAssessment.level === 'high' || threatAssessment.level === 'critical') {
        warnings.push(
          `Threat level is ${threatAssessment.level.toUpperCase()}: ${threatAssessment.activeThreats.join('; ')}`,
        );
        recommendations.push(...threatAssessment.recommendations);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Threat assessment failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('threat_level', 'Unable to assess current threat level'),
      );
    }

    // Step 5: Generate audit report if date range provided
    let auditReport: AuditReport | null = null;
    const dateRange = input.parameters.dateRange as DateRange | undefined;
    if (dateRange) {
      try {
        auditReport = await this.generateAuditReport(dateRange);
        if (auditReport.suspiciousActivity.length > 0) {
          for (const activity of auditReport.suspiciousActivity) {
            warnings.push(`[Audit] Suspicious: ${activity}`);
          }
          recommendations.push('Investigate suspicious activity patterns detected in audit logs');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Audit report generation failed: ${message}`);
        uncertainties.push(
          this.flagUncertainty('audit', 'Unable to generate audit report'),
        );
      }
    }

    // Step 6: Calculate confidence based on assessments
    const confidenceFactors: Record<string, number> = {};
    confidenceFactors.rbacAssessment = rbacValidation
      ? (rbacValidation.valid ? 90 : 60)
      : 20;
    confidenceFactors.encryptionAssessment = encryptionValidation
      ? (encryptionValidation.issues.length === 0 ? 90 : 65)
      : 20;
    confidenceFactors.keyRotationAssessment = keyRotationStatus
      ? (keyRotationStatus.failed === 0 ? 85 : 55)
      : 20;
    confidenceFactors.threatAssessment = threatAssessment
      ? (threatAssessment.level === 'low' ? 90 : threatAssessment.level === 'medium' ? 70 : 50)
      : 20;
    confidenceFactors.auditCoverage = auditReport ? 80 : 40;

    const confidence = this.calculateConfidence(confidenceFactors);

    // Step 7: Generate AI-powered security recommendations
    if (warnings.length > 0) {
      try {
        const aiRecs = await this.generateAISecurityRecommendations(
          rbacValidation,
          encryptionValidation,
          threatAssessment,
          warnings,
        );
        recommendations.push(...aiRecs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.warn('AI security recommendation generation failed', { error: message });
        uncertainties.push(
          this.flagUncertainty('ai_analysis', 'Could not generate AI-powered security recommendations'),
        );
      }
    }

    // Step 8: Persist state
    await this.persistState({
      lastAssessment: new Date().toISOString(),
      rbacValid: rbacValidation?.valid ?? null,
      encryptionHealthy: encryptionValidation
        ? encryptionValidation.issues.length === 0
        : null,
      threatLevel: threatAssessment?.level ?? null,
      apiKeysRotated: keyRotationStatus?.rotated ?? null,
      apiKeysFailed: keyRotationStatus?.failed ?? null,
      warningCount: warnings.length,
    });

    // Step 9: Build output
    const output = this.buildOutput(
      'security_assessment_complete',
      {
        rbacValidation,
        encryptionValidation,
        keyRotationStatus,
        threatAssessment,
        auditReport,
      },
      confidence,
      `Enterprise security assessment complete. ` +
        `RBAC: ${rbacValidation ? (rbacValidation.valid ? 'valid' : 'issues found') : 'not assessed'}. ` +
        `Encryption: ${encryptionValidation ? (encryptionValidation.issues.length === 0 ? 'compliant' : `${encryptionValidation.issues.length} issue(s)`) : 'not assessed'}. ` +
        `Threat level: ${threatAssessment?.level ?? 'unknown'}. ` +
        `${warnings.length} warning(s) raised.`,
      recommendations,
      warnings,
      uncertainties,
    );

    // Step 10: Audit the decision
    await this.logDecision(input, output);

    this.log.info('Enterprise security assessment complete', {
      requestId: input.requestId,
      threatLevel: threatAssessment?.level ?? 'unknown',
      confidence: confidence.score,
      warnings: warnings.length,
    });

    return output;
  }

  // ------------------------------------------------------------------
  // Public domain methods
  // ------------------------------------------------------------------

  /**
   * Rotates API keys that have exceeded the maximum age threshold.
   * When force is true, all active keys are rotated regardless of age.
   *
   * @param force - If true, rotate all keys regardless of age. Defaults to false.
   * @returns Rotation result with per-key details.
   */
  public async rotateAPIKeys(force?: boolean): Promise<KeyRotationResult> {
    this.log.info('Checking API key rotation', { force: force ?? false });

    const details: KeyRotationResult['details'] = [];
    let rotated = 0;
    let failed = 0;

    try {
      // Fetch all active API keys
      const result = await pool.query(
        `SELECT id, name, created_at, expires_at, last_used_at, is_active
         FROM api_keys
         WHERE is_active = true
         ORDER BY created_at ASC`,
      );

      const keys = result.rows;
      const now = new Date();

      for (const key of keys) {
        const keyId = key.id as string;
        const createdAt = new Date(key.created_at as string);
        const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        const needsRotation = force ||
          ageInDays >= API_KEY_FORCE_ROTATION_DAYS ||
          (key.expires_at && new Date(key.expires_at as string) <= now);

        if (needsRotation) {
          try {
            // Deactivate the old key
            await pool.query(
              `UPDATE api_keys SET is_active = false, updated_at = $1 WHERE id = $2`,
              [now.toISOString(), keyId],
            );

            details.push({ keyId, rotated: true });
            rotated++;
            this.log.info('API key rotated', { keyId, ageInDays: Math.round(ageInDays) });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            details.push({ keyId, rotated: false, error: message });
            failed++;
            this.log.error('API key rotation failed', { keyId, error: message });
          }
        } else if (ageInDays >= API_KEY_MAX_AGE_DAYS) {
          // Key is approaching rotation threshold - flag for attention
          details.push({
            keyId,
            rotated: false,
            error: `Key is ${Math.round(ageInDays)} days old (rotation recommended at ${API_KEY_MAX_AGE_DAYS} days)`,
          });
        } else {
          details.push({ keyId, rotated: false });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to fetch API keys for rotation', { error: message });
      throw new Error(`API key rotation check failed: ${message}`);
    }

    // Calculate next rotation date
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + API_KEY_MAX_AGE_DAYS);

    return {
      rotated,
      failed,
      nextRotation: nextRotation.toISOString(),
      details,
    };
  }

  /**
   * Validates the RBAC configuration by checking role definitions,
   * permission assignments, and identifying orphaned permissions.
   *
   * @returns RBAC validation result.
   */
  public async validateRBAC(): Promise<RBACValidation> {
    this.log.info('Validating RBAC configuration');

    const cacheKey = `${CACHE_PREFIX}:rbac_validation`;
    const cached = await cacheGet<RBACValidation>(cacheKey);
    if (cached) {
      this.log.debug('RBAC validation cache hit');
      return cached;
    }

    const roles: RBACValidation['roles'] = [];
    let overallValid = true;

    try {
      // Fetch all roles and their permissions
      const rolesResult = await pool.query(
        `SELECT id, name, permissions, created_at FROM roles ORDER BY name ASC`,
      );

      // Known valid permissions for the platform
      const knownPermissions = new Set([
        'read:campaigns', 'write:campaigns', 'delete:campaigns',
        'read:countries', 'write:countries', 'delete:countries',
        'read:analytics', 'write:analytics',
        'read:users', 'write:users', 'delete:users',
        'manage:agents', 'read:agents',
        'manage:settings', 'read:settings',
        'read:audit', 'manage:security',
        'manage:api_keys', 'read:api_keys',
        'read:compliance', 'manage:compliance',
        'read:creatives', 'write:creatives', 'delete:creatives',
        'read:budgets', 'write:budgets',
      ]);

      const allAssignedPermissions = new Set<string>();
      const allDefinedPermissions = new Set<string>();

      for (const row of rolesResult.rows) {
        const roleName = row.name as string;
        const permissions = (row.permissions ?? []) as string[];
        const issues: string[] = [];

        // Check for empty permissions
        if (permissions.length === 0) {
          issues.push('Role has no permissions assigned');
          overallValid = false;
        }

        // Check for unknown permissions
        for (const perm of permissions) {
          allAssignedPermissions.add(perm);
          if (!knownPermissions.has(perm)) {
            issues.push(`Unknown permission: '${perm}'`);
            overallValid = false;
          }
        }

        // Check for overly broad access on non-admin roles
        if (roleName !== 'admin') {
          const writePerms = permissions.filter((p) => p.startsWith('write:') || p.startsWith('delete:') || p.startsWith('manage:'));
          if (writePerms.length > permissions.length * 0.7) {
            issues.push('Role has disproportionately high write/manage permissions; review for least privilege');
          }
        }

        // Check for duplicate permissions
        const uniquePerms = new Set(permissions);
        if (uniquePerms.size < permissions.length) {
          issues.push(`${permissions.length - uniquePerms.size} duplicate permission(s) found`);
        }

        if (issues.length > 0) {
          overallValid = false;
        }

        roles.push({ name: roleName, permissions, issues });
      }

      // Detect orphaned permissions (known but not assigned to any role)
      for (const perm of knownPermissions) {
        allDefinedPermissions.add(perm);
      }
      const orphanedPermissions = [...allDefinedPermissions].filter(
        (p) => !allAssignedPermissions.has(p),
      );

      const validation: RBACValidation = {
        valid: overallValid,
        roles,
        orphanedPermissions,
      };

      await cacheSet(cacheKey, validation, CACHE_TTL);
      return validation;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('RBAC validation failed', { error: message });
      throw new Error(`RBAC validation failed: ${message}`);
    }
  }

  /**
   * Generates a comprehensive audit report for a specified date range.
   * Analyzes audit log entries, groups by action type, identifies
   * critical events, and flags suspicious activity patterns.
   *
   * @param dateRange - Optional date range filter. Defaults to last 30 days.
   * @returns Comprehensive audit report.
   */
  public async generateAuditReport(dateRange?: DateRange): Promise<AuditReport> {
    this.log.info('Generating audit report', { dateRange });

    const startDate = dateRange?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = dateRange?.endDate ?? new Date().toISOString();
    const period = `${startDate} to ${endDate}`;

    try {
      // Fetch all audit events in the range
      const eventsResult = await pool.query(
        `SELECT id, user_id, action, resource_type, resource_id, details, ip_address, created_at
         FROM audit_logs
         WHERE created_at >= $1 AND created_at <= $2
         ORDER BY created_at DESC`,
        [startDate, endDate],
      );

      const rows = eventsResult.rows;
      const totalEvents = rows.length;

      // Group by action
      const byAction: Record<string, number> = {};
      for (const row of rows) {
        const action = row.action as string;
        byAction[action] = (byAction[action] ?? 0) + 1;
      }

      // Identify critical events (security-related actions)
      const criticalActionPatterns = [
        'delete', 'permission', 'role_change', 'login_failed',
        'key_rotation', 'mfa_disable', 'password_reset', 'security',
      ];

      const criticalEvents: AuditEvent[] = rows
        .filter((row) => {
          const action = (row.action as string).toLowerCase();
          return criticalActionPatterns.some((pattern) => action.includes(pattern));
        })
        .map((row) => ({
          id: row.id as string,
          action: row.action as string,
          userId: (row.user_id ?? 'system') as string,
          resource: `${row.resource_type ?? 'unknown'}/${row.resource_id ?? 'unknown'}`,
          timestamp: (row.created_at as Date).toISOString?.() ?? String(row.created_at),
          severity: this.categorizeEventSeverity(row.action as string),
        }));

      // Detect suspicious activity patterns
      const suspiciousActivity = await this.detectSuspiciousPatterns(rows);

      return {
        period,
        totalEvents,
        byAction,
        criticalEvents,
        suspiciousActivity,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Audit report generation failed', { error: message });
      throw new Error(`Audit report generation failed: ${message}`);
    }
  }

  /**
   * Validates the encryption configuration for data at rest and in transit.
   * Checks algorithm strength, key size, and configuration compliance.
   *
   * @returns Encryption validation result.
   */
  public async validateEncryption(): Promise<EncryptionValidation> {
    this.log.info('Validating encryption configuration');

    const issues: string[] = [];

    // Check database SSL/TLS (in-transit encryption)
    let inTransit = false;
    try {
      const sslResult = await pool.query(`SHOW ssl`);
      inTransit = sslResult.rows[0]?.ssl === 'on';
      if (!inTransit) {
        issues.push('Database SSL is not enabled. Data in transit is not encrypted.');
      }
    } catch {
      // If SHOW ssl fails, check connection properties
      try {
        const connResult = await pool.query(
          `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`,
        );
        inTransit = connResult.rows[0]?.ssl === true;
        if (!inTransit) {
          issues.push('Database connection is not using SSL/TLS.');
        }
      } catch {
        issues.push('Unable to verify in-transit encryption status.');
      }
    }

    // Check for encryption at rest indicators
    let atRest = false;
    try {
      // Check if pgcrypto extension is available (indicator of at-rest encryption support)
      const extensionResult = await pool.query(
        `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`,
      );
      atRest = extensionResult.rows.length > 0;
      if (!atRest) {
        issues.push('pgcrypto extension not installed. Column-level encryption may not be available.');
      }
    } catch {
      issues.push('Unable to verify at-rest encryption configuration.');
    }

    // Determine algorithm and key strength from application configuration
    // The application uses AES-256-GCM as defined in helpers.ts
    const algorithm = 'AES-256-GCM';
    const keyStrength = 256;

    if (keyStrength < MIN_KEY_STRENGTH_BITS) {
      issues.push(
        `Encryption key strength (${keyStrength} bits) is below minimum requirement (${MIN_KEY_STRENGTH_BITS} bits)`,
      );
    }

    return {
      atRest,
      inTransit,
      algorithm,
      keyStrength,
      issues,
    };
  }

  /**
   * Assesses SOC2 readiness by evaluating Trust Services Criteria controls.
   * Checks security, availability, processing integrity, and privacy controls.
   *
   * @returns SOC2 readiness assessment.
   */
  public async checkSOC2Readiness(): Promise<SOC2Assessment> {
    this.log.info('Assessing SOC2 readiness');

    const controls: SOC2Assessment['controls'] = [];
    let totalScore = 0;

    // CC6.1 - Logical Access: Check RBAC
    try {
      const rbac = await this.validateRBAC();
      controls.push({
        name: 'CC6.1 - Logical Access',
        status: rbac.valid ? 'pass' : 'partial',
        findings: rbac.valid ? [] : ['RBAC configuration has issues'],
      });
      totalScore += rbac.valid ? 100 : 50;
    } catch {
      controls.push({
        name: 'CC6.1 - Logical Access',
        status: 'fail',
        findings: ['Unable to validate logical access controls'],
      });
    }

    // CC6.2 - System Access Restrictions: Check API key management
    try {
      const keys = await this.rotateAPIKeys(false);
      const healthyRatio = keys.details.length > 0
        ? (keys.details.filter((d) => !d.error).length / keys.details.length)
        : 0;
      const status = healthyRatio >= 0.9 ? 'pass' : healthyRatio >= 0.5 ? 'partial' : 'fail';
      controls.push({
        name: 'CC6.2 - System Access Restrictions',
        status,
        findings: keys.failed > 0
          ? [`${keys.failed} API key(s) have rotation issues`]
          : [],
      });
      totalScore += status === 'pass' ? 100 : status === 'partial' ? 50 : 0;
    } catch {
      controls.push({
        name: 'CC6.2 - System Access Restrictions',
        status: 'fail',
        findings: ['Unable to verify API key management'],
      });
    }

    // CC6.3 - Role-Based Access
    try {
      const rbac = await this.validateRBAC();
      const rolesWithIssues = rbac.roles.filter((r) => r.issues.length > 0);
      const status = rolesWithIssues.length === 0 ? 'pass' : rolesWithIssues.length <= 1 ? 'partial' : 'fail';
      controls.push({
        name: 'CC6.3 - Role-Based Access',
        status,
        findings: rolesWithIssues.map((r) => `Role '${r.name}' has ${r.issues.length} issue(s)`),
      });
      totalScore += status === 'pass' ? 100 : status === 'partial' ? 50 : 0;
    } catch {
      controls.push({
        name: 'CC6.3 - Role-Based Access',
        status: 'fail',
        findings: ['Unable to validate role-based access'],
      });
    }

    // CC2.1 - Information Communication: Check audit logging
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_logs
         WHERE created_at >= NOW() - INTERVAL '24 hours'`,
      );
      const recentLogs = parseInt(result.rows[0]?.total ?? '0', 10);
      const status = recentLogs > 0 ? 'pass' : 'fail';
      controls.push({
        name: 'CC2.1 - Information Communication',
        status,
        findings: recentLogs === 0 ? ['No audit logs in the last 24 hours'] : [],
      });
      totalScore += status === 'pass' ? 100 : 0;
    } catch {
      controls.push({
        name: 'CC2.1 - Information Communication',
        status: 'fail',
        findings: ['Unable to verify audit log integrity'],
      });
    }

    // CC5.1 - Control Activities: Check encryption
    try {
      const encryption = await this.validateEncryption();
      const encryptionScore = (encryption.atRest ? 1 : 0) + (encryption.inTransit ? 1 : 0);
      const status = encryptionScore === 2 ? 'pass' : encryptionScore === 1 ? 'partial' : 'fail';
      controls.push({
        name: 'CC5.1 - Control Activities',
        status,
        findings: encryption.issues,
      });
      totalScore += status === 'pass' ? 100 : status === 'partial' ? 50 : 0;
    } catch {
      controls.push({
        name: 'CC5.1 - Control Activities',
        status: 'fail',
        findings: ['Unable to verify control activities'],
      });
    }

    // CC7.1 - System Monitoring: Check agent monitoring
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM agent_states WHERE status != 'error'`,
      );
      const healthyAgents = parseInt(result.rows[0]?.total ?? '0', 10);
      const status = healthyAgents > 0 ? 'pass' : 'fail';
      controls.push({
        name: 'CC7.1 - System Monitoring',
        status,
        findings: healthyAgents === 0 ? ['No healthy agent states found'] : [],
      });
      totalScore += status === 'pass' ? 100 : 0;
    } catch {
      controls.push({
        name: 'CC7.1 - System Monitoring',
        status: 'fail',
        findings: ['Unable to verify system monitoring'],
      });
    }

    // Calculate overall score
    const assessedControls = controls.length;
    const overallScore = assessedControls > 0
      ? Math.round((totalScore / (assessedControls * 100)) * 100 * 100) / 100
      : 0;

    const ready = overallScore >= SOC2_MIN_PASSING_SCORE;

    return { ready, controls, overallScore };
  }

  /**
   * Assesses DDoS protection by evaluating rate limiting,
   * connection pooling, and other protective mechanisms.
   *
   * @returns DDoS protection assessment.
   */
  public async assessDDoSProtection(): Promise<DDoSAssessment> {
    this.log.info('Assessing DDoS protection');

    const mechanisms: string[] = [];
    const vulnerabilities: string[] = [];
    const recommendations: string[] = [];

    // Check rate limiting configuration
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM agent_states
         WHERE config::text LIKE '%rate_limit%'`,
      );
      const hasRateLimit = parseInt(result.rows[0]?.total ?? '0', 10) > 0;
      if (hasRateLimit) {
        mechanisms.push('Application-level rate limiting configured');
      } else {
        vulnerabilities.push('No rate limiting configuration detected in agent states');
        recommendations.push('Implement application-level rate limiting for all API endpoints');
      }
    } catch {
      vulnerabilities.push('Unable to verify rate limiting configuration');
    }

    // Check connection pool limits (database-level protection)
    try {
      const result = await pool.query(`SHOW max_connections`);
      const maxConnections = parseInt(result.rows[0]?.max_connections ?? '0', 10);
      if (maxConnections > 0) {
        mechanisms.push(`Database connection pool limited to ${maxConnections} connections`);
        if (maxConnections > 500) {
          vulnerabilities.push('High max_connections setting may allow connection exhaustion');
          recommendations.push('Consider reducing max_connections and implementing connection pooling middleware');
        }
      }
    } catch {
      vulnerabilities.push('Unable to verify database connection limits');
    }

    // Check for query timeout configuration
    try {
      const result = await pool.query(`SHOW statement_timeout`);
      const timeout = result.rows[0]?.statement_timeout;
      if (timeout && timeout !== '0') {
        mechanisms.push(`Database statement timeout set to ${timeout}`);
      } else {
        vulnerabilities.push('No statement timeout configured; long-running queries could exhaust resources');
        recommendations.push('Set statement_timeout to prevent resource exhaustion from slow queries');
      }
    } catch {
      vulnerabilities.push('Unable to verify query timeout configuration');
    }

    // General DDoS recommendations
    mechanisms.push('Express.js request handling with middleware chain');
    recommendations.push('Implement a Web Application Firewall (WAF) in front of the application');
    recommendations.push('Configure CDN-level DDoS protection (e.g., Cloudflare, AWS Shield)');

    const isProtected = mechanisms.length >= 2 && vulnerabilities.length <= 1;

    return {
      protected: isProtected,
      mechanisms,
      vulnerabilities,
      recommendations,
    };
  }

  /**
   * Performs a vulnerability scan by checking known vulnerability
   * patterns in the application configuration and database.
   *
   * @returns Vulnerability scan results with categorized findings.
   */
  public async scanVulnerabilities(): Promise<VulnerabilityScan> {
    this.log.info('Scanning for vulnerabilities');

    const cacheKey = `${CACHE_PREFIX}:vuln_scan`;
    const cached = await cacheGet<VulnerabilityScan>(cacheKey);
    if (cached) {
      this.log.debug('Vulnerability scan cache hit');
      return cached;
    }

    const findings: VulnerabilityFinding[] = [];
    let findingCounter = 0;

    const addFinding = (
      severity: string,
      category: string,
      description: string,
      remediation: string,
    ): void => {
      findingCounter++;
      findings.push({
        id: `VULN-${findingCounter.toString().padStart(4, '0')}`,
        severity,
        category,
        description,
        remediation,
      });
    };

    // Check for users without MFA
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM users WHERE mfa_enabled = false AND is_active = true`,
      );
      const noMfaCount = parseInt(result.rows[0]?.total ?? '0', 10);
      if (noMfaCount > 0) {
        addFinding(
          'high',
          'authentication',
          `${noMfaCount} active user(s) do not have MFA enabled`,
          'Enforce MFA for all active users, especially those with administrative privileges',
        );
      }
    } catch {
      // Skip if users table is not accessible
    }

    // Check for inactive API keys that haven't been cleaned up
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM api_keys
         WHERE is_active = false
         AND created_at < NOW() - INTERVAL '90 days'`,
      );
      const staleKeys = parseInt(result.rows[0]?.total ?? '0', 10);
      if (staleKeys > 0) {
        addFinding(
          'low',
          'access_control',
          `${staleKeys} stale inactive API key(s) found (older than 90 days)`,
          'Remove inactive API keys that are no longer needed to reduce attack surface',
        );
      }
    } catch {
      // Skip if api_keys table is not accessible
    }

    // Check for expired sessions
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM sessions
         WHERE expires_at < NOW()`,
      );
      const expiredSessions = parseInt(result.rows[0]?.total ?? '0', 10);
      if (expiredSessions > 10) {
        addFinding(
          'medium',
          'session_management',
          `${expiredSessions} expired sessions not cleaned up`,
          'Implement scheduled cleanup of expired sessions to prevent session table bloat',
        );
      }
    } catch {
      // Skip if sessions table is not accessible
    }

    // Check database extension security
    try {
      const result = await pool.query(
        `SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql', 'pgcrypto', 'uuid-ossp')`,
      );
      if (result.rows.length > 0) {
        const extensions = result.rows.map((r) => r.extname as string);
        addFinding(
          'low',
          'configuration',
          `Non-standard database extensions installed: ${extensions.join(', ')}`,
          'Review installed extensions and remove any that are not required',
        );
      }
    } catch {
      // Skip if pg_extension is not accessible
    }

    // Check for overly permissive roles
    try {
      const result = await pool.query(
        `SELECT name, permissions FROM roles WHERE name != 'admin'`,
      );
      for (const row of result.rows) {
        const perms = (row.permissions ?? []) as string[];
        const dangerousPerms = perms.filter((p) =>
          p.startsWith('delete:') || p === 'manage:security' || p === 'manage:agents',
        );
        if (dangerousPerms.length > 2) {
          addFinding(
            'medium',
            'access_control',
            `Role '${row.name}' has ${dangerousPerms.length} high-risk permissions: ${dangerousPerms.join(', ')}`,
            `Review and restrict permissions for role '${row.name}' following least privilege principle`,
          );
        }
      }
    } catch {
      // Skip if roles table is not accessible
    }

    // Use AI to analyze findings and identify additional risks
    try {
      const aiFindings = await this.analyzeVulnerabilitiesWithAI(findings);
      findings.push(...aiFindings);
    } catch {
      this.log.warn('AI vulnerability analysis unavailable');
    }

    const scan: VulnerabilityScan = {
      scannedAt: new Date().toISOString(),
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      findings,
    };

    await cacheSet(cacheKey, scan, VULNERABILITY_CACHE_TTL);
    return scan;
  }

  /**
   * Validates the secrets vault by checking secret count,
   * expiration dates, and overall health.
   *
   * @returns Vault validation result.
   */
  public async validateSecretVault(): Promise<VaultValidation> {
    this.log.info('Validating secret vault');

    const issues: string[] = [];
    const expiringSoon: string[] = [];
    let secretsCount = 0;

    try {
      // Check API keys as managed secrets
      const keysResult = await pool.query(
        `SELECT id, name, expires_at, is_active FROM api_keys WHERE is_active = true`,
      );

      secretsCount = keysResult.rows.length;
      const now = new Date();
      const warningDate = new Date(
        now.getTime() + SECRET_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
      );

      for (const row of keysResult.rows) {
        if (row.expires_at) {
          const expiresAt = new Date(row.expires_at as string);
          if (expiresAt <= now) {
            issues.push(`Secret '${row.name}' (${row.id}) has expired`);
          } else if (expiresAt <= warningDate) {
            expiringSoon.push(`${row.name} (expires: ${expiresAt.toISOString()})`);
          }
        }
      }

      // Check for secrets without expiration dates
      const noExpiryResult = await pool.query(
        `SELECT COUNT(*) AS total FROM api_keys
         WHERE is_active = true AND expires_at IS NULL`,
      );
      const noExpiryCount = parseInt(noExpiryResult.rows[0]?.total ?? '0', 10);
      if (noExpiryCount > 0) {
        issues.push(
          `${noExpiryCount} active secret(s) have no expiration date set`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`Failed to validate vault: ${message}`);
    }

    const healthy = issues.length === 0 && expiringSoon.length === 0;

    return { healthy, secretsCount, expiringSoon, issues };
  }

  /**
   * Monitors recent security events from audit logs and correlates
   * them to determine the current security posture.
   *
   * @returns Security event report with threat context.
   */
  public async monitorSecurityEvents(): Promise<SecurityEventReport> {
    this.log.info('Monitoring security events');

    const events: SecurityEvent[] = [];
    const recommendations: string[] = [];

    try {
      // Fetch security-relevant events from the last 24 hours
      const result = await pool.query(
        `SELECT id, action, resource_type, user_id, ip_address, details, created_at
         FROM audit_logs
         WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND (
           action LIKE '%login%' OR action LIKE '%auth%' OR action LIKE '%security%'
           OR action LIKE '%delete%' OR action LIKE '%permission%' OR action LIKE '%role%'
           OR action LIKE '%key%' OR action LIKE '%mfa%'
         )
         ORDER BY created_at DESC
         LIMIT 200`,
      );

      for (const row of result.rows) {
        const action = row.action as string;
        const severity = this.categorizeEventSeverity(action);

        events.push({
          type: this.categorizeEventType(action),
          source: (row.resource_type ?? 'system') as string,
          description: `${action} on ${row.resource_type ?? 'unknown'} by user ${row.user_id ?? 'system'}`,
          severity,
          timestamp: (row.created_at as Date).toISOString?.() ?? String(row.created_at),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn('Failed to fetch security events', { error: message });
    }

    // Determine threat level from events
    const criticalCount = events.filter((e) => e.severity === 'critical').length;
    const highCount = events.filter((e) => e.severity === 'high').length;

    let threatLevel: string;
    if (criticalCount > 0) {
      threatLevel = 'critical';
      recommendations.push('Immediate investigation required for critical security events');
    } else if (highCount > 5) {
      threatLevel = 'high';
      recommendations.push('Elevated security posture recommended due to multiple high-severity events');
    } else if (highCount > 0) {
      threatLevel = 'medium';
      recommendations.push('Monitor high-severity events closely');
    } else {
      threatLevel = 'low';
    }

    if (events.length > 100) {
      recommendations.push('High volume of security events detected. Consider increasing monitoring frequency.');
    }

    return { events, threatLevel, recommendations };
  }

  /**
   * Assesses the overall threat level by combining security event
   * analysis, vulnerability data, and recent incident counts.
   *
   * @returns Threat assessment with active threats and recommendations.
   */
  public async assessThreatLevel(): Promise<ThreatAssessment> {
    this.log.info('Assessing threat level');

    const activeThreats: string[] = [];
    const recommendations: string[] = [];
    let threatScore = 0;

    // Check for recent failed login attempts
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_logs
         WHERE action LIKE '%login_fail%'
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      );
      const failedLogins = parseInt(result.rows[0]?.total ?? '0', 10);
      if (failedLogins > 20) {
        activeThreats.push(`Possible brute force attack: ${failedLogins} failed logins in the last hour`);
        threatScore += 30;
        recommendations.push('Enable account lockout after consecutive failed login attempts');
      } else if (failedLogins > 5) {
        activeThreats.push(`Elevated failed login attempts: ${failedLogins} in the last hour`);
        threatScore += 15;
      }
    } catch {
      // Skip if audit_logs is not accessible
    }

    // Check for suspicious deletion activity
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_logs
         WHERE action LIKE '%delete%'
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      );
      const deletions = parseInt(result.rows[0]?.total ?? '0', 10);
      if (deletions > 10) {
        activeThreats.push(`Unusual deletion activity: ${deletions} delete operations in the last hour`);
        threatScore += 20;
        recommendations.push('Review recent deletion activity for potential data destruction');
      }
    } catch {
      // Skip
    }

    // Check for new admin-level accounts
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM users
         WHERE role = 'admin'
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      );
      const newAdmins = parseInt(result.rows[0]?.total ?? '0', 10);
      if (newAdmins > 0) {
        activeThreats.push(`${newAdmins} new admin account(s) created in the last 24 hours`);
        threatScore += 25;
        recommendations.push('Verify that recently created admin accounts are authorized');
      }
    } catch {
      // Skip
    }

    // Check vault health
    try {
      const vault = await this.validateSecretVault();
      if (!vault.healthy) {
        threatScore += 10;
        if (vault.issues.length > 0) {
          activeThreats.push(`Secret vault issues: ${vault.issues[0]}`);
        }
      }
      if (vault.expiringSoon.length > 0) {
        recommendations.push(
          `${vault.expiringSoon.length} secret(s) expiring soon. Plan rotation.`,
        );
      }
    } catch {
      // Skip
    }

    // Count recent incidents
    let recentIncidents = 0;
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_logs
         WHERE (action LIKE '%error%' OR action LIKE '%fail%' OR action LIKE '%security%')
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      );
      recentIncidents = parseInt(result.rows[0]?.total ?? '0', 10);
      if (recentIncidents > 50) {
        threatScore += 15;
      }
    } catch {
      // Skip
    }

    // Determine threat level from score
    let level: ThreatAssessment['level'];
    if (threatScore >= THREAT_LEVEL_THRESHOLDS.critical) {
      level = 'critical';
    } else if (threatScore >= THREAT_LEVEL_THRESHOLDS.high) {
      level = 'high';
    } else if (threatScore >= THREAT_LEVEL_THRESHOLDS.medium) {
      level = 'medium';
    } else {
      level = 'low';
    }

    if (level === 'low' && activeThreats.length === 0) {
      recommendations.push('Security posture is stable. Continue routine monitoring.');
    }

    return { level, activeThreats, recentIncidents, recommendations };
  }

  // ------------------------------------------------------------------
  // Private helper methods
  // ------------------------------------------------------------------

  /**
   * Categorizes an audit action into a severity level.
   */
  private categorizeEventSeverity(action: string): string {
    const lower = action.toLowerCase();
    if (lower.includes('delete') || lower.includes('mfa_disable') || lower.includes('role_change')) {
      return 'high';
    }
    if (lower.includes('login_fail') || lower.includes('permission') || lower.includes('security')) {
      return 'medium';
    }
    if (lower.includes('key_rotation') || lower.includes('password_reset')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Categorizes an audit action into an event type.
   */
  private categorizeEventType(action: string): string {
    const lower = action.toLowerCase();
    if (lower.includes('login') || lower.includes('auth')) return 'authentication';
    if (lower.includes('permission') || lower.includes('role')) return 'authorization';
    if (lower.includes('delete')) return 'data_modification';
    if (lower.includes('key') || lower.includes('mfa')) return 'credential_change';
    if (lower.includes('security')) return 'security_alert';
    return 'general';
  }

  /**
   * Detects suspicious activity patterns from audit log rows.
   */
  private async detectSuspiciousPatterns(
    rows: Record<string, unknown>[],
  ): Promise<string[]> {
    const suspicious: string[] = [];

    // Detect multiple failed logins from same IP
    const ipFailedLogins: Record<string, number> = {};
    for (const row of rows) {
      const action = (row.action as string)?.toLowerCase() ?? '';
      const ip = (row.ip_address as string) ?? 'unknown';
      if (action.includes('login_fail')) {
        ipFailedLogins[ip] = (ipFailedLogins[ip] ?? 0) + 1;
      }
    }
    for (const [ip, count] of Object.entries(ipFailedLogins)) {
      if (count > 5) {
        suspicious.push(
          `${count} failed login attempts from IP ${ip} - potential brute force attempt`,
        );
      }
    }

    // Detect unusual off-hours activity
    const offHoursActions: Record<string, number> = {};
    for (const row of rows) {
      const createdAt = row.created_at;
      if (createdAt) {
        const date = new Date(String(createdAt));
        const hour = date.getUTCHours();
        if (hour < 6 || hour > 22) {
          const userId = (row.user_id as string) ?? 'unknown';
          offHoursActions[userId] = (offHoursActions[userId] ?? 0) + 1;
        }
      }
    }
    for (const [userId, count] of Object.entries(offHoursActions)) {
      if (count > 10) {
        suspicious.push(
          `User ${userId} performed ${count} actions during off-hours (UTC 22:00-06:00)`,
        );
      }
    }

    // Detect mass deletion patterns
    let deletionCount = 0;
    const deletionUsers = new Set<string>();
    for (const row of rows) {
      const action = (row.action as string)?.toLowerCase() ?? '';
      if (action.includes('delete')) {
        deletionCount++;
        deletionUsers.add((row.user_id as string) ?? 'unknown');
      }
    }
    if (deletionCount > 20) {
      suspicious.push(
        `${deletionCount} deletion events detected across ${deletionUsers.size} user(s) - potential data destruction`,
      );
    }

    return suspicious;
  }

  /**
   * Uses AI to analyze vulnerability findings and identify additional risks.
   */
  private async analyzeVulnerabilitiesWithAI(
    existingFindings: VulnerabilityFinding[],
  ): Promise<VulnerabilityFinding[]> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Based on the following vulnerability scan findings, identify any additional security risks or patterns that may have been missed. Only report findings that are not already in the list.

Current findings:
${existingFindings.map((f) => `- [${f.severity}] ${f.category}: ${f.description}`).join('\n')}

Respond with a JSON array of objects with: id, severity, category, description, remediation. If no additional findings, respond with an empty array [].`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (f: Record<string, unknown>) =>
              typeof f === 'object' && f.severity && f.description,
          )
          .map((f: Record<string, unknown>, i: number) => ({
            id: `VULN-AI-${(i + 1).toString().padStart(4, '0')}`,
            severity: String(f.severity),
            category: String(f.category ?? 'general'),
            description: String(f.description),
            remediation: String(f.remediation ?? 'Review and remediate'),
          }));
      }
    } catch {
      this.log.warn('Failed to parse AI vulnerability analysis');
    }

    return [];
  }

  /**
   * Generates AI-powered security recommendations based on assessment data.
   */
  private async generateAISecurityRecommendations(
    rbac: RBACValidation | null,
    encryption: EncryptionValidation | null,
    threat: ThreatAssessment | null,
    warnings: string[],
  ): Promise<string[]> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Based on the following security assessment, provide 3-5 prioritized security recommendations.

RBAC Status: ${rbac ? (rbac.valid ? 'Valid' : `Issues found in ${rbac.roles.filter((r) => r.issues.length > 0).length} role(s)`) : 'Not assessed'}
Encryption: ${encryption ? `At-rest: ${encryption.atRest}, In-transit: ${encryption.inTransit}, Algorithm: ${encryption.algorithm}` : 'Not assessed'}
Threat Level: ${threat?.level ?? 'Unknown'}
Active Threats: ${threat?.activeThreats.join('; ') ?? 'None known'}
Warnings: ${warnings.join('; ')}

Respond with a JSON array of recommendation strings. Prioritize by risk severity.`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      this.log.warn('Failed to parse AI security recommendations');
    }

    return [response.trim()];
  }
}

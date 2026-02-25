/**
 * Security Hardening Service.
 *
 * Provides comprehensive security controls including API key rotation,
 * encryption validation, IP whitelisting, agent access scoping, threat
 * scanning, secrets vault management, SOC2 readiness checks, DDoS
 * protection configuration, and aggregate security reporting.
 *
 * Every security-sensitive operation is audit-logged. Secrets are always
 * encrypted at rest using AES-256-GCM.
 */

import crypto from 'crypto';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId, encrypt, decrypt } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyRotationResult {
  key_id: string;
  old_key_hash: string;
  new_key_hash: string;
  rotated_at: string;
  next_rotation_at: string;
}

export interface EncryptionStatus {
  at_rest: boolean;
  in_transit: boolean;
  algorithm: string;
  key_strength: number;
  last_validated: string;
}

export interface IPWhitelistEntry {
  id: string;
  ip_address: string;
  description: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  expires_at?: string;
}

export interface AgentAccessScope {
  agent_type: string;
  allowed_tables: string[];
  allowed_operations: string[];
  max_query_rate: number;
  is_active: boolean;
}

export interface ThreatScanResult {
  id: string;
  scan_type: string;
  findings: ThreatFinding[];
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  scanned_at: string;
}

export interface ThreatFinding {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  remediation: string;
}

export interface SecretsVaultEntry {
  id: string;
  name: string;
  encrypted_value: string;
  created_by: string;
  expires_at?: string;
  last_rotated_at: string;
  created_at: string;
}

export interface SOC2Control {
  id: string;
  name: string;
  category: string;
  status: 'compliant' | 'non_compliant' | 'partial';
  evidence: string;
  last_checked: string;
}

export interface DDoSProtectionConfig {
  rate_limit_per_minute: number;
  rate_limit_burst: number;
  block_duration_seconds: number;
  allowed_origins: string[];
  geo_blocking_enabled: boolean;
  blocked_countries: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_IP_WHITELIST = 'security:ip_whitelist';
const CACHE_KEY_SECURITY_REPORT = 'security:report';
const CACHE_TTL_IP_WHITELIST = 300; // 5 minutes
const CACHE_TTL_SECURITY_REPORT = 600; // 10 minutes
const KEY_ROTATION_DAYS = 30;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-security-key-32-chars!!';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SecurityHardeningService {
  // -------------------------------------------------------------------------
  // 1. API Key Rotation
  // -------------------------------------------------------------------------

  /**
   * Auto-rotate API keys older than 30 days.
   *
   * When `force` is true, all active keys are rotated regardless of age.
   * Each rotated key gets a new AES-256-GCM encrypted value; the old key
   * is deactivated. Every rotation is audit-logged.
   */
  static async rotateAPIKeys(force = false): Promise<KeyRotationResult[]> {
    const cutoffCondition = force
      ? 'is_active = true'
      : `is_active = true AND created_at < NOW() - INTERVAL '${KEY_ROTATION_DAYS} days'`;

    const keysResult = await pool.query(
      `SELECT id, key_hash, encrypted_key, user_id, name, scopes
       FROM api_keys
       WHERE ${cutoffCondition}
       ORDER BY created_at ASC`,
    );

    const results: KeyRotationResult[] = [];

    for (const row of keysResult.rows) {
      const newRawKey = `mktg_${crypto.randomBytes(32).toString('hex')}`;
      const newKeyHash = crypto.createHash('sha256').update(newRawKey).digest('hex');
      const newEncryptedKey = encrypt(newRawKey, ENCRYPTION_KEY);
      const newKeyId = generateId();
      const now = new Date();
      const nextRotation = new Date(now.getTime() + KEY_ROTATION_DAYS * 24 * 60 * 60 * 1000);

      // Deactivate old key
      await pool.query(
        `UPDATE api_keys SET is_active = false WHERE id = $1`,
        [row.id],
      );

      // Insert new key
      await pool.query(
        `INSERT INTO api_keys (id, user_id, name, key_hash, encrypted_key, scopes, is_active, created_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NULL)`,
        [newKeyId, row.user_id, row.name, newKeyHash, newEncryptedKey, row.scopes],
      );

      await AuditService.log({
        action: 'security.api_key_rotated',
        resourceType: 'api_key',
        resourceId: newKeyId,
        details: {
          old_key_id: row.id,
          new_key_id: newKeyId,
          forced: force,
        },
      });

      logger.info('API key rotated', {
        oldKeyId: row.id,
        newKeyId,
        forced: force,
      });

      results.push({
        key_id: newKeyId,
        old_key_hash: row.key_hash,
        new_key_hash: newKeyHash,
        rotated_at: now.toISOString(),
        next_rotation_at: nextRotation.toISOString(),
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // 2. Encryption Validation
  // -------------------------------------------------------------------------

  /**
   * Verify encryption at rest (DB SSL config) and in transit (TLS settings).
   */
  static async validateEncryption(): Promise<EncryptionStatus> {
    // Check database SSL configuration
    const sslResult = await pool.query(
      `SELECT current_setting('ssl', true) AS ssl_enabled`,
    );
    const atRest = sslResult.rows[0]?.ssl_enabled === 'on';

    // Check TLS / connection encryption status
    const tlsResult = await pool.query(
      `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`,
    );
    const inTransit = tlsResult.rows.length > 0 && tlsResult.rows[0]?.ssl === true;

    const now = new Date().toISOString();

    const status: EncryptionStatus = {
      at_rest: atRest,
      in_transit: inTransit,
      algorithm: 'AES-256-GCM',
      key_strength: 256,
      last_validated: now,
    };

    await AuditService.log({
      action: 'security.encryption_validated',
      resourceType: 'encryption',
      details: {
        at_rest: status.at_rest,
        in_transit: status.in_transit,
      },
    });

    logger.info('Encryption validation completed', status);

    return status;
  }

  // -------------------------------------------------------------------------
  // 3. IP Whitelist Management
  // -------------------------------------------------------------------------

  /**
   * Add, remove, or update IP whitelist entries.
   */
  static async manageIPWhitelist(
    action: 'add' | 'remove' | 'update',
    entry: Partial<IPWhitelistEntry>,
  ): Promise<IPWhitelistEntry> {
    let result;

    switch (action) {
      case 'add': {
        if (!entry.ip_address || !entry.created_by) {
          throw new ValidationError('ip_address and created_by are required to add a whitelist entry');
        }
        const id = generateId();
        result = await pool.query(
          `INSERT INTO ip_whitelist (id, ip_address, description, created_by, is_active, created_at, expires_at)
           VALUES ($1, $2, $3, $4, true, NOW(), $5)
           RETURNING *`,
          [id, entry.ip_address, entry.description || '', entry.created_by, entry.expires_at || null],
        );
        break;
      }

      case 'remove': {
        if (!entry.id) {
          throw new ValidationError('id is required to remove a whitelist entry');
        }
        result = await pool.query(
          `UPDATE ip_whitelist SET is_active = false WHERE id = $1 RETURNING *`,
          [entry.id],
        );
        if (result.rows.length === 0) {
          throw new NotFoundError('IP whitelist entry not found');
        }
        break;
      }

      case 'update': {
        if (!entry.id) {
          throw new ValidationError('id is required to update a whitelist entry');
        }
        result = await pool.query(
          `UPDATE ip_whitelist
           SET ip_address = COALESCE($2, ip_address),
               description = COALESCE($3, description),
               expires_at = COALESCE($4, expires_at),
               is_active = COALESCE($5, is_active)
           WHERE id = $1
           RETURNING *`,
          [
            entry.id,
            entry.ip_address || null,
            entry.description || null,
            entry.expires_at || null,
            entry.is_active !== undefined ? entry.is_active : null,
          ],
        );
        if (result.rows.length === 0) {
          throw new NotFoundError('IP whitelist entry not found');
        }
        break;
      }

      default:
        throw new ValidationError(`Invalid action: ${action}`);
    }

    const saved: IPWhitelistEntry = {
      id: result.rows[0].id,
      ip_address: result.rows[0].ip_address,
      description: result.rows[0].description,
      created_by: result.rows[0].created_by,
      is_active: result.rows[0].is_active,
      created_at: result.rows[0].created_at,
      expires_at: result.rows[0].expires_at || undefined,
    };

    // Invalidate cache
    await cacheDel(CACHE_KEY_IP_WHITELIST);

    await AuditService.log({
      action: `security.ip_whitelist_${action}`,
      resourceType: 'ip_whitelist',
      resourceId: saved.id,
      details: { action, ip_address: saved.ip_address },
    });

    logger.info('IP whitelist updated', { action, id: saved.id, ip_address: saved.ip_address });

    return saved;
  }

  // -------------------------------------------------------------------------
  // 4. Check IP Whitelist
  // -------------------------------------------------------------------------

  /**
   * Check if an IP address is in the active whitelist.
   */
  static async checkIPWhitelist(
    ipAddress: string,
  ): Promise<{ allowed: boolean; entry?: IPWhitelistEntry }> {
    const entries = await SecurityHardeningService.getIPWhitelist();

    const match = entries.find(
      (e) =>
        e.ip_address === ipAddress &&
        e.is_active &&
        (!e.expires_at || new Date(e.expires_at) > new Date()),
    );

    return match
      ? { allowed: true, entry: match }
      : { allowed: false };
  }

  // -------------------------------------------------------------------------
  // 5. Get IP Whitelist
  // -------------------------------------------------------------------------

  /**
   * Get all active whitelist entries. Cached for 5 minutes.
   */
  static async getIPWhitelist(): Promise<IPWhitelistEntry[]> {
    const cached = await cacheGet<IPWhitelistEntry[]>(CACHE_KEY_IP_WHITELIST);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT id, ip_address, description, created_by, is_active, created_at, expires_at
       FROM ip_whitelist
       WHERE is_active = true
       ORDER BY created_at DESC`,
    );

    const entries: IPWhitelistEntry[] = result.rows.map((row) => ({
      id: row.id,
      ip_address: row.ip_address,
      description: row.description,
      created_by: row.created_by,
      is_active: row.is_active,
      created_at: row.created_at,
      expires_at: row.expires_at || undefined,
    }));

    await cacheSet(CACHE_KEY_IP_WHITELIST, entries, CACHE_TTL_IP_WHITELIST);

    return entries;
  }

  // -------------------------------------------------------------------------
  // 6. Configure Agent Scope
  // -------------------------------------------------------------------------

  /**
   * Set access scope for an agent type (allowed tables, operations, rate limits).
   */
  static async configureAgentScope(
    agentType: string,
    scope: Omit<AgentAccessScope, 'agent_type'>,
  ): Promise<AgentAccessScope> {
    const result = await pool.query(
      `INSERT INTO agent_access_scopes (agent_type, allowed_tables, allowed_operations, max_query_rate, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (agent_type) DO UPDATE
       SET allowed_tables = EXCLUDED.allowed_tables,
           allowed_operations = EXCLUDED.allowed_operations,
           max_query_rate = EXCLUDED.max_query_rate,
           is_active = EXCLUDED.is_active
       RETURNING *`,
      [
        agentType,
        JSON.stringify(scope.allowed_tables),
        JSON.stringify(scope.allowed_operations),
        scope.max_query_rate,
        scope.is_active,
      ],
    );

    const row = result.rows[0];
    const savedScope: AgentAccessScope = {
      agent_type: row.agent_type,
      allowed_tables: typeof row.allowed_tables === 'string'
        ? JSON.parse(row.allowed_tables)
        : row.allowed_tables,
      allowed_operations: typeof row.allowed_operations === 'string'
        ? JSON.parse(row.allowed_operations)
        : row.allowed_operations,
      max_query_rate: row.max_query_rate,
      is_active: row.is_active,
    };

    await AuditService.log({
      action: 'security.agent_scope_configured',
      resourceType: 'agent_scope',
      resourceId: agentType,
      details: { scope: savedScope },
    });

    logger.info('Agent access scope configured', { agentType, scope: savedScope });

    return savedScope;
  }

  // -------------------------------------------------------------------------
  // 7. Validate Agent Access
  // -------------------------------------------------------------------------

  /**
   * Check if an agent has permission for a specific table/operation.
   */
  static async validateAgentAccess(
    agentType: string,
    table: string,
    operation: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const result = await pool.query(
      `SELECT agent_type, allowed_tables, allowed_operations, max_query_rate, is_active
       FROM agent_access_scopes
       WHERE agent_type = $1`,
      [agentType],
    );

    if (result.rows.length === 0) {
      return { allowed: false, reason: `No access scope defined for agent type: ${agentType}` };
    }

    const row = result.rows[0];

    if (!row.is_active) {
      return { allowed: false, reason: `Agent type ${agentType} is currently disabled` };
    }

    const allowedTables: string[] = typeof row.allowed_tables === 'string'
      ? JSON.parse(row.allowed_tables)
      : row.allowed_tables;

    const allowedOperations: string[] = typeof row.allowed_operations === 'string'
      ? JSON.parse(row.allowed_operations)
      : row.allowed_operations;

    if (!allowedTables.includes(table) && !allowedTables.includes('*')) {
      return { allowed: false, reason: `Agent ${agentType} does not have access to table: ${table}` };
    }

    if (!allowedOperations.includes(operation) && !allowedOperations.includes('*')) {
      return { allowed: false, reason: `Agent ${agentType} is not allowed to perform operation: ${operation}` };
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // 8. Threat Scanning
  // -------------------------------------------------------------------------

  /**
   * Run automated threat scan: check for users without MFA, expired API keys,
   * stale sessions, weak passwords, and excessive failed logins.
   */
  static async scanForThreats(): Promise<ThreatScanResult> {
    const findings: ThreatFinding[] = [];

    // Check for users without MFA
    const mfaResult = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE mfa_enabled = false AND is_active = true`,
    );
    const usersWithoutMFA = parseInt(mfaResult.rows[0].count, 10);
    if (usersWithoutMFA > 0) {
      findings.push({
        type: 'missing_mfa',
        severity: 'warning',
        description: `${usersWithoutMFA} active user(s) do not have MFA enabled`,
        remediation: 'Enforce MFA for all active users through security policy',
      });
    }

    // Check for expired API keys still active
    const expiredKeysResult = await pool.query(
      `SELECT COUNT(*) AS count FROM api_keys
       WHERE is_active = true AND created_at < NOW() - INTERVAL '${KEY_ROTATION_DAYS} days'`,
    );
    const expiredKeys = parseInt(expiredKeysResult.rows[0].count, 10);
    if (expiredKeys > 0) {
      findings.push({
        type: 'expired_api_keys',
        severity: 'critical',
        description: `${expiredKeys} API key(s) have not been rotated in over ${KEY_ROTATION_DAYS} days`,
        remediation: 'Rotate expired API keys immediately using rotateAPIKeys()',
      });
    }

    // Check for stale sessions
    const staleSessionsResult = await pool.query(
      `SELECT COUNT(*) AS count FROM sessions
       WHERE is_active = true AND last_activity_at < NOW() - INTERVAL '24 hours'`,
    );
    const staleSessions = parseInt(staleSessionsResult.rows[0].count, 10);
    if (staleSessions > 0) {
      findings.push({
        type: 'stale_sessions',
        severity: 'info',
        description: `${staleSessions} session(s) have been inactive for over 24 hours`,
        remediation: 'Consider implementing automatic session expiration',
      });
    }

    // Check for weak passwords (users who have not updated password recently)
    const weakPasswordResult = await pool.query(
      `SELECT COUNT(*) AS count FROM users
       WHERE is_active = true AND password_updated_at < NOW() - INTERVAL '90 days'`,
    );
    const weakPasswords = parseInt(weakPasswordResult.rows[0].count, 10);
    if (weakPasswords > 0) {
      findings.push({
        type: 'stale_passwords',
        severity: 'warning',
        description: `${weakPasswords} user(s) have not updated their password in over 90 days`,
        remediation: 'Enforce periodic password rotation policy',
      });
    }

    // Check for excessive failed logins
    const failedLoginsResult = await pool.query(
      `SELECT COUNT(*) AS count FROM audit_logs
       WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '1 hour'`,
    );
    const failedLogins = parseInt(failedLoginsResult.rows[0].count, 10);
    if (failedLogins > 10) {
      findings.push({
        type: 'excessive_failed_logins',
        severity: 'critical',
        description: `${failedLogins} failed login attempts in the last hour`,
        remediation: 'Investigate potential brute-force attack and consider IP blocking',
      });
    }

    // Determine overall risk level
    const riskLevel = SecurityHardeningService.calculateRiskLevel(findings);

    const scanId = generateId();
    const now = new Date().toISOString();

    const scanResult: ThreatScanResult = {
      id: scanId,
      scan_type: 'comprehensive',
      findings,
      risk_level: riskLevel,
      scanned_at: now,
    };

    // Persist scan results
    await pool.query(
      `INSERT INTO threat_scans (id, scan_type, findings, risk_level, scanned_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [scanId, 'comprehensive', JSON.stringify(findings), riskLevel, now],
    );

    await AuditService.log({
      action: 'security.threat_scan_completed',
      resourceType: 'threat_scan',
      resourceId: scanId,
      details: {
        findings_count: findings.length,
        risk_level: riskLevel,
      },
    });

    logger.info('Threat scan completed', {
      scanId,
      findingsCount: findings.length,
      riskLevel,
    });

    return scanResult;
  }

  /**
   * Calculate overall risk level from findings.
   */
  private static calculateRiskLevel(
    findings: ThreatFinding[],
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (findings.length === 0) {
      return 'none';
    }

    const hasCritical = findings.some((f) => f.severity === 'critical');
    const hasWarning = findings.some((f) => f.severity === 'warning');
    const criticalCount = findings.filter((f) => f.severity === 'critical').length;

    if (criticalCount >= 2) {
      return 'critical';
    }
    if (hasCritical) {
      return 'high';
    }
    if (hasWarning) {
      return 'medium';
    }
    return 'low';
  }

  // -------------------------------------------------------------------------
  // 9. Secrets Vault
  // -------------------------------------------------------------------------

  /**
   * Add, update, delete, or rotate secrets in vault.
   * Values are always encrypted at rest.
   */
  static async manageSecret(
    action: 'set' | 'get' | 'delete' | 'rotate',
    name: string,
    value?: string,
  ): Promise<SecretsVaultEntry | null> {
    switch (action) {
      case 'set': {
        if (value === undefined) {
          throw new ValidationError('Value is required when setting a secret');
        }
        const encryptedValue = encrypt(value, ENCRYPTION_KEY);
        const id = generateId();
        const now = new Date().toISOString();

        const result = await pool.query(
          `INSERT INTO secrets_vault (id, name, encrypted_value, created_by, last_rotated_at, created_at)
           VALUES ($1, $2, $3, 'system', $4, $4)
           ON CONFLICT (name) DO UPDATE
           SET encrypted_value = EXCLUDED.encrypted_value,
               last_rotated_at = EXCLUDED.last_rotated_at
           RETURNING *`,
          [id, name, encryptedValue, now],
        );

        const entry = SecurityHardeningService.mapVaultRow(result.rows[0]);

        await AuditService.log({
          action: 'security.secret_set',
          resourceType: 'secrets_vault',
          resourceId: entry.id,
          details: { name },
        });

        logger.info('Secret stored in vault', { name, id: entry.id });

        return entry;
      }

      case 'get': {
        const result = await pool.query(
          `SELECT * FROM secrets_vault WHERE name = $1`,
          [name],
        );

        if (result.rows.length === 0) {
          throw new NotFoundError(`Secret not found: ${name}`);
        }

        const entry = SecurityHardeningService.mapVaultRow(result.rows[0]);

        await AuditService.log({
          action: 'security.secret_accessed',
          resourceType: 'secrets_vault',
          resourceId: entry.id,
          details: { name },
        });

        return entry;
      }

      case 'delete': {
        const result = await pool.query(
          `DELETE FROM secrets_vault WHERE name = $1 RETURNING *`,
          [name],
        );

        if (result.rows.length === 0) {
          throw new NotFoundError(`Secret not found: ${name}`);
        }

        const entry = SecurityHardeningService.mapVaultRow(result.rows[0]);

        await AuditService.log({
          action: 'security.secret_deleted',
          resourceType: 'secrets_vault',
          resourceId: entry.id,
          details: { name },
        });

        logger.info('Secret deleted from vault', { name, id: entry.id });

        return entry;
      }

      case 'rotate': {
        if (value === undefined) {
          throw new ValidationError('New value is required when rotating a secret');
        }

        const existing = await pool.query(
          `SELECT * FROM secrets_vault WHERE name = $1`,
          [name],
        );

        if (existing.rows.length === 0) {
          throw new NotFoundError(`Secret not found: ${name}`);
        }

        const encryptedValue = encrypt(value, ENCRYPTION_KEY);
        const now = new Date().toISOString();

        const result = await pool.query(
          `UPDATE secrets_vault
           SET encrypted_value = $2, last_rotated_at = $3
           WHERE name = $1
           RETURNING *`,
          [name, encryptedValue, now],
        );

        const entry = SecurityHardeningService.mapVaultRow(result.rows[0]);

        await AuditService.log({
          action: 'security.secret_rotated',
          resourceType: 'secrets_vault',
          resourceId: entry.id,
          details: { name },
        });

        logger.info('Secret rotated in vault', { name, id: entry.id });

        return entry;
      }

      default:
        throw new ValidationError(`Invalid secret action: ${action}`);
    }
  }

  /**
   * Map a database row to a SecretsVaultEntry.
   */
  private static mapVaultRow(row: Record<string, unknown>): SecretsVaultEntry {
    return {
      id: row.id as string,
      name: row.name as string,
      encrypted_value: row.encrypted_value as string,
      created_by: row.created_by as string,
      expires_at: (row.expires_at as string) || undefined,
      last_rotated_at: row.last_rotated_at as string,
      created_at: row.created_at as string,
    };
  }

  // -------------------------------------------------------------------------
  // 10. SOC2 Readiness
  // -------------------------------------------------------------------------

  /**
   * Evaluate SOC2 Trust Services Criteria compliance.
   * Checks: access controls, change management, risk assessment, monitoring,
   * and incident response.
   */
  static async checkSOC2Readiness(): Promise<SOC2Control[]> {
    const controls: SOC2Control[] = [];
    const now = new Date().toISOString();

    // CC6.1 - Access Controls
    const accessControlResult = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE mfa_enabled = true) AS mfa_count
       FROM users WHERE is_active = true`,
    );
    const totalUsers = parseInt(accessControlResult.rows[0].total, 10);
    const mfaUsers = parseInt(accessControlResult.rows[0].mfa_count, 10);
    const mfaCompliance = totalUsers > 0 ? mfaUsers / totalUsers : 0;

    controls.push({
      id: generateId(),
      name: 'Access Controls (CC6.1)',
      category: 'access_control',
      status: mfaCompliance >= 1 ? 'compliant' : mfaCompliance >= 0.8 ? 'partial' : 'non_compliant',
      evidence: `${mfaUsers}/${totalUsers} users have MFA enabled (${Math.round(mfaCompliance * 100)}%)`,
      last_checked: now,
    });

    // CC8.1 - Change Management
    const changeManagementResult = await pool.query(
      `SELECT COUNT(*) AS count FROM audit_logs
       WHERE action LIKE 'change_%' AND created_at > NOW() - INTERVAL '30 days'`,
    );
    const changeLogCount = parseInt(changeManagementResult.rows[0].count, 10);

    controls.push({
      id: generateId(),
      name: 'Change Management (CC8.1)',
      category: 'change_management',
      status: changeLogCount > 0 ? 'compliant' : 'non_compliant',
      evidence: `${changeLogCount} change events logged in last 30 days`,
      last_checked: now,
    });

    // CC3.1 - Risk Assessment
    const riskAssessmentResult = await pool.query(
      `SELECT COUNT(*) AS count FROM threat_scans
       WHERE scanned_at > NOW() - INTERVAL '7 days'`,
    );
    const recentScans = parseInt(riskAssessmentResult.rows[0].count, 10);

    controls.push({
      id: generateId(),
      name: 'Risk Assessment (CC3.1)',
      category: 'risk_assessment',
      status: recentScans > 0 ? 'compliant' : 'non_compliant',
      evidence: `${recentScans} threat scan(s) conducted in last 7 days`,
      last_checked: now,
    });

    // CC7.1 - Monitoring
    const monitoringResult = await pool.query(
      `SELECT COUNT(*) AS count FROM audit_logs
       WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );
    const recentAuditLogs = parseInt(monitoringResult.rows[0].count, 10);

    controls.push({
      id: generateId(),
      name: 'System Monitoring (CC7.1)',
      category: 'monitoring',
      status: recentAuditLogs > 0 ? 'compliant' : 'non_compliant',
      evidence: `${recentAuditLogs} audit events logged in last 24 hours`,
      last_checked: now,
    });

    // CC7.3 - Incident Response
    const incidentResponseResult = await pool.query(
      `SELECT COUNT(*) AS count FROM security_incidents
       WHERE status = 'open' AND created_at > NOW() - INTERVAL '30 days'`,
    );
    const openIncidents = parseInt(incidentResponseResult.rows[0].count, 10);

    controls.push({
      id: generateId(),
      name: 'Incident Response (CC7.3)',
      category: 'incident_response',
      status: openIncidents === 0 ? 'compliant' : 'partial',
      evidence: `${openIncidents} open security incident(s) in last 30 days`,
      last_checked: now,
    });

    // Persist SOC2 check results
    for (const control of controls) {
      await pool.query(
        `INSERT INTO soc2_controls (id, name, category, status, evidence, last_checked)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE
         SET status = EXCLUDED.status,
             evidence = EXCLUDED.evidence,
             last_checked = EXCLUDED.last_checked`,
        [control.id, control.name, control.category, control.status, control.evidence, control.last_checked],
      );
    }

    await AuditService.log({
      action: 'security.soc2_readiness_checked',
      resourceType: 'soc2',
      details: {
        total_controls: controls.length,
        compliant: controls.filter((c) => c.status === 'compliant').length,
        non_compliant: controls.filter((c) => c.status === 'non_compliant').length,
        partial: controls.filter((c) => c.status === 'partial').length,
      },
    });

    logger.info('SOC2 readiness check completed', {
      totalControls: controls.length,
      compliant: controls.filter((c) => c.status === 'compliant').length,
    });

    return controls;
  }

  // -------------------------------------------------------------------------
  // 11. DDoS Protection
  // -------------------------------------------------------------------------

  /**
   * Update rate limiting and traffic filtering rules. Persists configuration.
   */
  static async configureDDoSProtection(
    config: DDoSProtectionConfig,
  ): Promise<DDoSProtectionConfig> {
    await pool.query(
      `INSERT INTO ddos_protection_config (id, config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE
       SET config = EXCLUDED.config,
           updated_at = NOW()`,
      ['default', JSON.stringify(config)],
    );

    await AuditService.log({
      action: 'security.ddos_protection_configured',
      resourceType: 'ddos_protection',
      resourceId: 'default',
      details: {
        rate_limit_per_minute: config.rate_limit_per_minute,
        rate_limit_burst: config.rate_limit_burst,
        block_duration_seconds: config.block_duration_seconds,
        geo_blocking_enabled: config.geo_blocking_enabled,
      },
    });

    logger.info('DDoS protection configured', {
      rateLimitPerMinute: config.rate_limit_per_minute,
      burstLimit: config.rate_limit_burst,
    });

    return config;
  }

  // -------------------------------------------------------------------------
  // 12. Security Report
  // -------------------------------------------------------------------------

  /**
   * Aggregate security posture: encryption status, key rotation status,
   * threat scan results, SOC2 readiness, IP whitelist status.
   * Cached for 10 minutes.
   */
  static async generateSecurityReport(): Promise<Record<string, unknown>> {
    const cached = await cacheGet<Record<string, unknown>>(CACHE_KEY_SECURITY_REPORT);
    if (cached) {
      return cached;
    }

    // Encryption status
    const encryptionStatus = await SecurityHardeningService.validateEncryption();

    // Key rotation status
    const keysNeedingRotation = await pool.query(
      `SELECT COUNT(*) AS count FROM api_keys
       WHERE is_active = true AND created_at < NOW() - INTERVAL '${KEY_ROTATION_DAYS} days'`,
    );
    const totalActiveKeys = await pool.query(
      `SELECT COUNT(*) AS count FROM api_keys WHERE is_active = true`,
    );

    // Latest threat scan
    const latestScan = await pool.query(
      `SELECT id, scan_type, findings, risk_level, scanned_at
       FROM threat_scans
       ORDER BY scanned_at DESC
       LIMIT 1`,
    );

    // SOC2 readiness
    const soc2Controls = await pool.query(
      `SELECT name, status, last_checked FROM soc2_controls ORDER BY name`,
    );

    // IP whitelist status
    const whitelistCount = await pool.query(
      `SELECT COUNT(*) AS count FROM ip_whitelist WHERE is_active = true`,
    );

    const report: Record<string, unknown> = {
      generated_at: new Date().toISOString(),
      encryption: encryptionStatus,
      key_rotation: {
        total_active_keys: parseInt(totalActiveKeys.rows[0].count, 10),
        keys_needing_rotation: parseInt(keysNeedingRotation.rows[0].count, 10),
        rotation_policy_days: KEY_ROTATION_DAYS,
      },
      threat_scan: latestScan.rows.length > 0
        ? {
            id: latestScan.rows[0].id,
            risk_level: latestScan.rows[0].risk_level,
            findings_count: typeof latestScan.rows[0].findings === 'string'
              ? JSON.parse(latestScan.rows[0].findings).length
              : latestScan.rows[0].findings.length,
            scanned_at: latestScan.rows[0].scanned_at,
          }
        : null,
      soc2_readiness: {
        controls: soc2Controls.rows.map((row) => ({
          name: row.name,
          status: row.status,
          last_checked: row.last_checked,
        })),
        compliant_count: soc2Controls.rows.filter((r) => r.status === 'compliant').length,
        total_count: soc2Controls.rows.length,
      },
      ip_whitelist: {
        active_entries: parseInt(whitelistCount.rows[0].count, 10),
      },
    };

    await cacheSet(CACHE_KEY_SECURITY_REPORT, report, CACHE_TTL_SECURITY_REPORT);

    await AuditService.log({
      action: 'security.report_generated',
      resourceType: 'security_report',
      details: { generated_at: report.generated_at },
    });

    logger.info('Security report generated');

    return report;
  }
}

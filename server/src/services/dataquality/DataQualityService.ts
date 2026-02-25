/**
 * Data Quality & Validation Service.
 *
 * Provides comprehensive data quality assurance including schema validation,
 * data consistency checks, PII detection and anonymization, consent management
 * (GDPR/CCPA), data lineage tracking, and quality scoring. All anonymization
 * operations are audit-logged for regulatory compliance.
 */

import crypto from 'crypto';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaValidationResult {
  table: string;
  valid: boolean;
  errors: SchemaError[];
  checked_at: string;
}

export interface SchemaError {
  column: string;
  expected_type: string;
  actual_type: string;
  issue: string;
}

export interface DataConsistencyReport {
  source: string;
  target: string;
  total_records: number;
  matched: number;
  mismatched: number;
  missing_in_target: number;
  missing_in_source: number;
  discrepancies: DataDiscrepancy[];
  checked_at: string;
}

export interface DataDiscrepancy {
  record_id: string;
  field: string;
  source_value: unknown;
  target_value: unknown;
}

export interface DataLineageRecord {
  table: string;
  upstream_sources: string[];
  downstream_consumers: string[];
  transformations: string[];
  last_updated: string;
}

export interface PIIField {
  table: string;
  column: string;
  pii_type: 'email' | 'name' | 'phone' | 'address' | 'ip' | 'financial';
  is_anonymized: boolean;
  anonymization_method?: string;
}

export interface ConsentRecord {
  user_id: string;
  consent_type: string;
  granted: boolean;
  granted_at?: string;
  revoked_at?: string;
  regulation: 'gdpr' | 'ccpa';
}

export interface DataQualityScore {
  table: string;
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  overall: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_LINEAGE_PREFIX = 'dataquality:lineage:';
const CACHE_KEY_QUALITY_REPORT = 'dataquality:quality_report';
const CACHE_TTL_LINEAGE = 300; // 5 minutes
const CACHE_TTL_QUALITY_REPORT = 900; // 15 minutes

/**
 * Expected schema definitions for monitored tables.
 * Maps table names to their expected column definitions.
 */
const EXPECTED_SCHEMAS: Record<string, Record<string, string>> = {
  products: {
    id: 'character varying',
    title: 'character varying',
    description: 'text',
    price: 'numeric',
    inventory_quantity: 'integer',
    status: 'character varying',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
  },
  campaigns: {
    id: 'character varying',
    name: 'character varying',
    country_id: 'character varying',
    platform: 'character varying',
    type: 'character varying',
    status: 'character varying',
    budget: 'numeric',
    spent: 'numeric',
    start_date: 'date',
    end_date: 'date',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
  },
  ad_spend: {
    id: 'character varying',
    campaign_id: 'character varying',
    platform: 'character varying',
    amount: 'numeric',
    date: 'date',
    created_at: 'timestamp with time zone',
  },
  consent_records: {
    id: 'character varying',
    user_id: 'character varying',
    consent_type: 'character varying',
    granted: 'boolean',
    granted_at: 'timestamp with time zone',
    revoked_at: 'timestamp with time zone',
    regulation: 'character varying',
    created_at: 'timestamp with time zone',
  },
};

/**
 * Known ETL relationships describing upstream sources, downstream consumers,
 * and transformations for each tracked table.
 */
const ETL_RELATIONSHIPS: Record<string, {
  upstream_sources: string[];
  downstream_consumers: string[];
  transformations: string[];
}> = {
  products: {
    upstream_sources: ['shopify_api'],
    downstream_consumers: ['campaigns', 'creatives', 'analytics'],
    transformations: ['shopify_sync', 'price_normalization'],
  },
  campaigns: {
    upstream_sources: ['products', 'countries', 'ad_platforms'],
    downstream_consumers: ['ad_spend', 'analytics', 'reports'],
    transformations: ['budget_allocation', 'audience_targeting'],
  },
  ad_spend: {
    upstream_sources: ['meta_api', 'google_api', 'tiktok_api', 'campaigns'],
    downstream_consumers: ['analytics', 'reports', 'budget'],
    transformations: ['currency_conversion', 'spend_aggregation'],
  },
};

/**
 * PII detection patterns mapping column name patterns to PII types.
 */
const PII_PATTERNS: Array<{ pattern: RegExp; pii_type: PIIField['pii_type'] }> = [
  { pattern: /email/i, pii_type: 'email' },
  { pattern: /^(first_?name|last_?name|full_?name|name)$/i, pii_type: 'name' },
  { pattern: /phone|mobile|tel/i, pii_type: 'phone' },
  { pattern: /address|street|city|zip|postal/i, pii_type: 'address' },
  { pattern: /ip_?address|ip$/i, pii_type: 'ip' },
  { pattern: /card|account|iban|routing|ssn|tax_id/i, pii_type: 'financial' },
];

/**
 * Tables monitored for data quality scoring.
 */
const MONITORED_TABLES = ['products', 'campaigns', 'ad_spend'];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DataQualityService {
  // -------------------------------------------------------------------------
  // Schema Validation
  // -------------------------------------------------------------------------

  /**
   * Validate a table's actual schema against the expected column definitions.
   *
   * Queries `information_schema.columns` and compares each column's data type
   * against the expected definitions stored in `EXPECTED_SCHEMAS`.
   */
  static async validateSchema(tableName: string): Promise<SchemaValidationResult> {
    const expectedSchema = EXPECTED_SCHEMAS[tableName];
    if (!expectedSchema) {
      throw new ValidationError(`No expected schema definition found for table: ${tableName}`);
    }

    const result = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );

    const actualColumns: Record<string, string> = {};
    for (const row of result.rows) {
      actualColumns[row.column_name as string] = row.data_type as string;
    }

    const errors: SchemaError[] = [];

    // Check for expected columns missing or mistyped in the actual schema
    for (const [column, expectedType] of Object.entries(expectedSchema)) {
      const actualType = actualColumns[column];
      if (!actualType) {
        errors.push({
          column,
          expected_type: expectedType,
          actual_type: 'MISSING',
          issue: `Column "${column}" is missing from table "${tableName}"`,
        });
      } else if (actualType !== expectedType) {
        errors.push({
          column,
          expected_type: expectedType,
          actual_type: actualType,
          issue: `Column "${column}" has type "${actualType}" but expected "${expectedType}"`,
        });
      }
    }

    const checkedAt = new Date().toISOString();

    logger.info('Schema validation completed', {
      table: tableName,
      valid: errors.length === 0,
      errorCount: errors.length,
    });

    return {
      table: tableName,
      valid: errors.length === 0,
      errors,
      checked_at: checkedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Shopify Data Verification
  // -------------------------------------------------------------------------

  /**
   * Cross-check the `products` table against Shopify data integrity rules:
   * - No null titles
   * - No negative prices
   * - Inventory >= 0
   * - All required fields present (title, price, status)
   */
  static async verifyShopifyData(): Promise<DataConsistencyReport> {
    // Check for null titles
    const nullTitlesResult = await pool.query(
      `SELECT id FROM products WHERE title IS NULL OR title = ''`,
    );

    // Check for negative prices
    const negativePricesResult = await pool.query(
      `SELECT id, price FROM products WHERE price < 0`,
    );

    // Check for negative inventory
    const negativeInventoryResult = await pool.query(
      `SELECT id, inventory_quantity FROM products WHERE inventory_quantity < 0`,
    );

    // Check for missing required fields
    const missingFieldsResult = await pool.query(
      `SELECT id FROM products
       WHERE title IS NULL OR price IS NULL OR status IS NULL`,
    );

    // Get total products count
    const totalResult = await pool.query(`SELECT COUNT(*) AS total FROM products`);
    const totalRecords = parseInt(totalResult.rows[0].total as string, 10);

    const discrepancies: DataDiscrepancy[] = [];

    for (const row of nullTitlesResult.rows) {
      discrepancies.push({
        record_id: row.id as string,
        field: 'title',
        source_value: null,
        target_value: 'non-empty string expected',
      });
    }

    for (const row of negativePricesResult.rows) {
      discrepancies.push({
        record_id: row.id as string,
        field: 'price',
        source_value: row.price,
        target_value: '>= 0',
      });
    }

    for (const row of negativeInventoryResult.rows) {
      discrepancies.push({
        record_id: row.id as string,
        field: 'inventory_quantity',
        source_value: row.inventory_quantity,
        target_value: '>= 0',
      });
    }

    for (const row of missingFieldsResult.rows) {
      // Avoid duplicating records already captured by null title check
      const alreadyTracked = discrepancies.some(
        (d) => d.record_id === (row.id as string) && d.field === 'title',
      );
      if (!alreadyTracked) {
        discrepancies.push({
          record_id: row.id as string,
          field: 'required_fields',
          source_value: null,
          target_value: 'title, price, status must be non-null',
        });
      }
    }

    const matched = totalRecords - discrepancies.length;
    const checkedAt = new Date().toISOString();

    logger.info('Shopify data verification completed', {
      totalRecords,
      discrepancies: discrepancies.length,
    });

    return {
      source: 'products',
      target: 'shopify_integrity_rules',
      total_records: totalRecords,
      matched: Math.max(0, matched),
      mismatched: discrepancies.length,
      missing_in_target: 0,
      missing_in_source: 0,
      discrepancies,
      checked_at: checkedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Ad Spend Validation
  // -------------------------------------------------------------------------

  /**
   * Compare internal ad spend records with platform-reported spend data.
   * Flags discrepancies exceeding the 5% tolerance threshold.
   */
  static async validateAdSpend(): Promise<DataConsistencyReport> {
    // Retrieve internal spend records aggregated by campaign and platform
    const internalResult = await pool.query(
      `SELECT campaign_id, platform, SUM(amount) AS internal_total
       FROM ad_spend
       GROUP BY campaign_id, platform`,
    );

    // Retrieve platform-reported spend (from platform_spend_reports table)
    const platformResult = await pool.query(
      `SELECT campaign_id, platform, SUM(reported_amount) AS platform_total
       FROM platform_spend_reports
       GROUP BY campaign_id, platform`,
    );

    // Build lookup for platform data
    const platformLookup: Record<string, number> = {};
    for (const row of platformResult.rows) {
      const key = `${row.campaign_id}:${row.platform}`;
      platformLookup[key] = parseFloat(row.platform_total as string);
    }

    const discrepancies: DataDiscrepancy[] = [];
    let matched = 0;
    let missingInTarget = 0;

    for (const row of internalResult.rows) {
      const key = `${row.campaign_id}:${row.platform}`;
      const internalTotal = parseFloat(row.internal_total as string);
      const platformTotal = platformLookup[key];

      if (platformTotal === undefined) {
        missingInTarget++;
        discrepancies.push({
          record_id: key,
          field: 'spend_amount',
          source_value: internalTotal,
          target_value: null,
        });
        // Remove from lookup to track missing_in_source later
        continue;
      }

      const difference = Math.abs(internalTotal - platformTotal);
      const threshold = internalTotal > 0 ? difference / internalTotal : 0;

      if (threshold > 0.05) {
        discrepancies.push({
          record_id: key,
          field: 'spend_amount',
          source_value: internalTotal,
          target_value: platformTotal,
        });
      } else {
        matched++;
      }

      delete platformLookup[key];
    }

    // Remaining entries in platformLookup are missing in internal records
    const missingInSource = Object.keys(platformLookup).length;
    for (const [key, platformTotal] of Object.entries(platformLookup)) {
      discrepancies.push({
        record_id: key,
        field: 'spend_amount',
        source_value: null,
        target_value: platformTotal,
      });
    }

    const totalRecords = internalResult.rows.length + missingInSource;
    const checkedAt = new Date().toISOString();

    logger.info('Ad spend validation completed', {
      totalRecords,
      matched,
      discrepancies: discrepancies.length,
    });

    return {
      source: 'ad_spend',
      target: 'platform_spend_reports',
      total_records: totalRecords,
      matched,
      mismatched: discrepancies.length - missingInTarget - missingInSource,
      missing_in_target: missingInTarget,
      missing_in_source: missingInSource,
      discrepancies,
      checked_at: checkedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Data Lineage
  // -------------------------------------------------------------------------

  /**
   * Build and persist data lineage for a table by analyzing known ETL
   * relationships and foreign key constraints.
   */
  static async trackDataLineage(tableName: string): Promise<DataLineageRecord> {
    // Retrieve foreign key relationships from the database
    const fkResult = await pool.query(
      `SELECT
         ccu.table_name AS referenced_table
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = $1`,
      [tableName],
    );

    const fkUpstream: string[] = fkResult.rows.map(
      (row) => row.referenced_table as string,
    );

    // Merge with known ETL relationships
    const etlRelation = ETL_RELATIONSHIPS[tableName];
    const upstreamSources = Array.from(new Set([
      ...fkUpstream,
      ...(etlRelation?.upstream_sources || []),
    ]));
    const downstreamConsumers = etlRelation?.downstream_consumers || [];
    const transformations = etlRelation?.transformations || [];

    const lastUpdated = new Date().toISOString();

    const lineageRecord: DataLineageRecord = {
      table: tableName,
      upstream_sources: upstreamSources,
      downstream_consumers: downstreamConsumers,
      transformations,
      last_updated: lastUpdated,
    };

    // Persist the lineage record
    const id = generateId();
    await pool.query(
      `INSERT INTO data_lineage (id, table_name, upstream_sources, downstream_consumers, transformations, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (table_name) DO UPDATE SET
         upstream_sources = EXCLUDED.upstream_sources,
         downstream_consumers = EXCLUDED.downstream_consumers,
         transformations = EXCLUDED.transformations,
         last_updated = EXCLUDED.last_updated`,
      [
        id,
        tableName,
        JSON.stringify(upstreamSources),
        JSON.stringify(downstreamConsumers),
        JSON.stringify(transformations),
        lastUpdated,
      ],
    );

    // Invalidate the cache for this table's lineage
    await cacheDel(`${CACHE_KEY_LINEAGE_PREFIX}${tableName}`);

    logger.info('Data lineage tracked', {
      table: tableName,
      upstreamCount: upstreamSources.length,
      downstreamCount: downstreamConsumers.length,
    });

    return lineageRecord;
  }

  /**
   * Retrieve stored data lineage for a table. Results are cached.
   */
  static async getDataLineage(tableName: string): Promise<DataLineageRecord> {
    const cacheKey = `${CACHE_KEY_LINEAGE_PREFIX}${tableName}`;

    const cached = await cacheGet<DataLineageRecord>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT table_name, upstream_sources, downstream_consumers, transformations, last_updated
       FROM data_lineage
       WHERE table_name = $1`,
      [tableName],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Data lineage not found for table: ${tableName}`);
    }

    const row = result.rows[0];
    const lineageRecord: DataLineageRecord = {
      table: row.table_name as string,
      upstream_sources: typeof row.upstream_sources === 'string'
        ? JSON.parse(row.upstream_sources)
        : row.upstream_sources as string[],
      downstream_consumers: typeof row.downstream_consumers === 'string'
        ? JSON.parse(row.downstream_consumers)
        : row.downstream_consumers as string[],
      transformations: typeof row.transformations === 'string'
        ? JSON.parse(row.transformations)
        : row.transformations as string[],
      last_updated: row.last_updated as string,
    };

    await cacheSet(cacheKey, lineageRecord, CACHE_TTL_LINEAGE);

    return lineageRecord;
  }

  // -------------------------------------------------------------------------
  // PII Anonymization
  // -------------------------------------------------------------------------

  /**
   * Anonymize specified PII columns in a table using secure methods:
   * - Emails: SHA-256 hash
   * - Names/phones: masking (preserve first/last characters)
   * - IPs: truncation (zero out last octet)
   *
   * All operations are recorded in the audit log.
   */
  static async anonymizePII(
    tableName: string,
    columns: Array<{ column: string; pii_type: PIIField['pii_type'] }>,
  ): Promise<{ anonymized_count: number; columns_processed: string[] }> {
    if (columns.length === 0) {
      throw new ValidationError('At least one column must be specified for anonymization');
    }

    let totalAnonymized = 0;
    const columnsProcessed: string[] = [];

    for (const { column, pii_type } of columns) {
      let updateQuery: string;

      switch (pii_type) {
        case 'email':
          // Hash emails using SHA-256
          updateQuery = `
            UPDATE ${sanitizeIdentifier(tableName)}
            SET ${sanitizeIdentifier(column)} = encode(
              sha256(${sanitizeIdentifier(column)}::bytea), 'hex'
            )
            WHERE ${sanitizeIdentifier(column)} IS NOT NULL
              AND ${sanitizeIdentifier(column)} NOT LIKE 'anon_%'`;
          break;

        case 'name':
          // Mask names: keep first character, replace rest with asterisks
          updateQuery = `
            UPDATE ${sanitizeIdentifier(tableName)}
            SET ${sanitizeIdentifier(column)} = CONCAT(
              LEFT(${sanitizeIdentifier(column)}, 1),
              REPEAT('*', GREATEST(LENGTH(${sanitizeIdentifier(column)}) - 2, 0)),
              RIGHT(${sanitizeIdentifier(column)}, 1)
            )
            WHERE ${sanitizeIdentifier(column)} IS NOT NULL
              AND LENGTH(${sanitizeIdentifier(column)}) > 0
              AND ${sanitizeIdentifier(column)} NOT LIKE '_*%'`;
          break;

        case 'phone':
          // Mask phone: keep last 4 digits
          updateQuery = `
            UPDATE ${sanitizeIdentifier(tableName)}
            SET ${sanitizeIdentifier(column)} = CONCAT(
              REPEAT('*', GREATEST(LENGTH(${sanitizeIdentifier(column)}) - 4, 0)),
              RIGHT(${sanitizeIdentifier(column)}, 4)
            )
            WHERE ${sanitizeIdentifier(column)} IS NOT NULL
              AND LENGTH(${sanitizeIdentifier(column)}) > 0
              AND ${sanitizeIdentifier(column)} NOT LIKE '***%'`;
          break;

        case 'ip':
          // Truncate IP: zero out last octet
          updateQuery = `
            UPDATE ${sanitizeIdentifier(tableName)}
            SET ${sanitizeIdentifier(column)} = CONCAT(
              SUBSTRING(${sanitizeIdentifier(column)} FROM '^(\\d+\\.\\d+\\.\\d+\\.)'),
              '0'
            )
            WHERE ${sanitizeIdentifier(column)} IS NOT NULL
              AND ${sanitizeIdentifier(column)} ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
              AND ${sanitizeIdentifier(column)} NOT LIKE '%.0'`;
          break;

        case 'address':
          // Hash addresses
          updateQuery = `
            UPDATE ${sanitizeIdentifier(tableName)}
            SET ${sanitizeIdentifier(column)} = encode(
              sha256(${sanitizeIdentifier(column)}::bytea), 'hex'
            )
            WHERE ${sanitizeIdentifier(column)} IS NOT NULL
              AND LENGTH(${sanitizeIdentifier(column)}) > 64`;
          break;

        case 'financial':
          // Hash financial data
          updateQuery = `
            UPDATE ${sanitizeIdentifier(tableName)}
            SET ${sanitizeIdentifier(column)} = encode(
              sha256(${sanitizeIdentifier(column)}::bytea), 'hex'
            )
            WHERE ${sanitizeIdentifier(column)} IS NOT NULL
              AND ${sanitizeIdentifier(column)} NOT LIKE 'anon_%'`;
          break;

        default:
          logger.warn('Unknown PII type, skipping column', { column, pii_type });
          continue;
      }

      const updateResult = await pool.query(updateQuery);
      const rowsAffected = updateResult.rowCount || 0;
      totalAnonymized += rowsAffected;
      columnsProcessed.push(column);

      // Audit log each anonymization operation
      const auditId = generateId();
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, NULL, $2, $3, $4, $5, NOW())`,
        [
          auditId,
          'pii.anonymize',
          'data_quality',
          tableName,
          JSON.stringify({
            column,
            pii_type,
            rows_affected: rowsAffected,
            method: getAnonymizationMethod(pii_type),
          }),
        ],
      );

      logger.info('PII column anonymized', {
        table: tableName,
        column,
        pii_type,
        rowsAffected,
      });
    }

    return {
      anonymized_count: totalAnonymized,
      columns_processed: columnsProcessed,
    };
  }

  // -------------------------------------------------------------------------
  // PII Detection
  // -------------------------------------------------------------------------

  /**
   * Scan all tables for potential PII fields based on column name patterns.
   * Returns a list of PII fields with their anonymization status.
   */
  static async detectPIIFields(): Promise<PIIField[]> {
    const result = await pool.query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    );

    const piiFields: PIIField[] = [];

    for (const row of result.rows) {
      const tableName = row.table_name as string;
      const columnName = row.column_name as string;

      for (const { pattern, pii_type } of PII_PATTERNS) {
        if (pattern.test(columnName)) {
          // Check if the column has already been anonymized by looking for
          // anonymization audit records
          const auditResult = await pool.query(
            `SELECT id FROM audit_logs
             WHERE action = 'pii.anonymize'
               AND resource_id = $1
               AND details::text LIKE $2
             LIMIT 1`,
            [tableName, `%"column":"${columnName}"%`],
          );

          const isAnonymized = auditResult.rows.length > 0;

          piiFields.push({
            table: tableName,
            column: columnName,
            pii_type,
            is_anonymized: isAnonymized,
            anonymization_method: isAnonymized
              ? getAnonymizationMethod(pii_type)
              : undefined,
          });
          break; // Only match the first pattern per column
        }
      }
    }

    logger.info('PII detection scan completed', {
      fieldsFound: piiFields.length,
    });

    return piiFields;
  }

  // -------------------------------------------------------------------------
  // Consent Management
  // -------------------------------------------------------------------------

  /**
   * Verify a user has valid consent records for the specified regulation.
   * Returns true if all required consent types are granted, false otherwise.
   */
  static async checkConsentCompliance(
    userId: string,
    regulation: 'gdpr' | 'ccpa',
  ): Promise<{ compliant: boolean; missing_consents: string[]; records: ConsentRecord[] }> {
    const requiredConsents = regulation === 'gdpr'
      ? ['data_processing', 'marketing', 'analytics']
      : ['data_sale_opt_out', 'data_processing'];

    const result = await pool.query(
      `SELECT user_id, consent_type, granted, granted_at, revoked_at, regulation
       FROM consent_records
       WHERE user_id = $1 AND regulation = $2`,
      [userId, regulation],
    );

    const records: ConsentRecord[] = result.rows.map((row) => ({
      user_id: row.user_id as string,
      consent_type: row.consent_type as string,
      granted: row.granted as boolean,
      granted_at: row.granted_at as string | undefined,
      revoked_at: row.revoked_at as string | undefined,
      regulation: row.regulation as 'gdpr' | 'ccpa',
    }));

    const grantedTypes = new Set(
      records.filter((r) => r.granted).map((r) => r.consent_type),
    );

    const missingConsents = requiredConsents.filter(
      (ct) => !grantedTypes.has(ct),
    );

    const compliant = missingConsents.length === 0;

    logger.info('Consent compliance check completed', {
      userId,
      regulation,
      compliant,
      missingCount: missingConsents.length,
    });

    return { compliant, missing_consents: missingConsents, records };
  }

  /**
   * Record or update a consent decision for a user.
   */
  static async manageConsent(
    userId: string,
    consentType: string,
    granted: boolean,
    regulation: 'gdpr' | 'ccpa',
  ): Promise<ConsentRecord> {
    const id = generateId();
    const now = new Date().toISOString();

    const result = await pool.query(
      `INSERT INTO consent_records (id, user_id, consent_type, granted, granted_at, revoked_at, regulation, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, consent_type, regulation) DO UPDATE SET
         granted = EXCLUDED.granted,
         granted_at = CASE WHEN EXCLUDED.granted = TRUE THEN $5 ELSE consent_records.granted_at END,
         revoked_at = CASE WHEN EXCLUDED.granted = FALSE THEN $6 ELSE NULL END
       RETURNING user_id, consent_type, granted, granted_at, revoked_at, regulation`,
      [
        id,
        userId,
        consentType,
        granted,
        granted ? now : null,
        granted ? null : now,
        regulation,
      ],
    );

    const row = result.rows[0];
    const record: ConsentRecord = {
      user_id: row.user_id as string,
      consent_type: row.consent_type as string,
      granted: row.granted as boolean,
      granted_at: row.granted_at as string | undefined,
      revoked_at: row.revoked_at as string | undefined,
      regulation: row.regulation as 'gdpr' | 'ccpa',
    };

    // Audit log consent change
    const auditId = generateId();
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        auditId,
        userId,
        granted ? 'consent.grant' : 'consent.revoke',
        'consent',
        id,
        JSON.stringify({ consent_type: consentType, regulation }),
      ],
    );

    logger.info('Consent record updated', {
      userId,
      consentType,
      granted,
      regulation,
    });

    return record;
  }

  /**
   * Get all consent records for a user.
   */
  static async getConsentStatus(userId: string): Promise<ConsentRecord[]> {
    const result = await pool.query(
      `SELECT user_id, consent_type, granted, granted_at, revoked_at, regulation
       FROM consent_records
       WHERE user_id = $1
       ORDER BY regulation, consent_type`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`No consent records found for user: ${userId}`);
    }

    return result.rows.map((row) => ({
      user_id: row.user_id as string,
      consent_type: row.consent_type as string,
      granted: row.granted as boolean,
      granted_at: row.granted_at as string | undefined,
      revoked_at: row.revoked_at as string | undefined,
      regulation: row.regulation as 'gdpr' | 'ccpa',
    }));
  }

  // -------------------------------------------------------------------------
  // Data Quality Scoring
  // -------------------------------------------------------------------------

  /**
   * Compute data quality score for a table across four dimensions:
   * - Completeness: percentage of non-null values
   * - Accuracy: percentage of values within expected ranges
   * - Consistency: percentage of records matching cross-reference expectations
   * - Timeliness: data freshness (how recently data was updated)
   *
   * Overall score is the weighted average of the four dimensions.
   */
  static async calculateDataQuality(tableName: string): Promise<DataQualityScore> {
    // Completeness: check for NULL values across all columns
    const columnsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'`,
      [tableName],
    );

    const columnNames: string[] = columnsResult.rows.map(
      (row) => row.column_name as string,
    );

    if (columnNames.length === 0) {
      throw new NotFoundError(`Table "${tableName}" not found or has no columns`);
    }

    // Get total row count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM ${sanitizeIdentifier(tableName)}`,
    );
    const totalRows = parseInt(countResult.rows[0].total as string, 10);

    if (totalRows === 0) {
      return {
        table: tableName,
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        timeliness: 0,
        overall: 0,
      };
    }

    // Calculate completeness: average non-null rate across all columns
    const nullChecks = columnNames.map(
      (col) =>
        `SUM(CASE WHEN ${sanitizeIdentifier(col)} IS NOT NULL THEN 1 ELSE 0 END)::float / COUNT(*)`,
    );
    const completenessResult = await pool.query(
      `SELECT ${nullChecks.join(', ')} FROM ${sanitizeIdentifier(tableName)}`,
    );
    const completenessValues = Object.values(completenessResult.rows[0]) as number[];
    const completeness = completenessValues.length > 0
      ? (completenessValues.reduce((sum, v) => sum + parseFloat(String(v)), 0) / completenessValues.length) * 100
      : 0;

    // Calculate accuracy: check values within expected constraints
    const accuracyResult = await pool.query(
      `SELECT COUNT(*) AS valid_count FROM ${sanitizeIdentifier(tableName)}
       WHERE ${getAccuracyConstraints(tableName)}`,
    );
    const validCount = parseInt(accuracyResult.rows[0].valid_count as string, 10);
    const accuracy = (validCount / totalRows) * 100;

    // Calculate consistency: check referential integrity
    const consistencyResult = await pool.query(
      `SELECT COUNT(*) AS consistent_count FROM ${sanitizeIdentifier(tableName)}
       WHERE ${getConsistencyConstraints(tableName)}`,
    );
    const consistentCount = parseInt(consistencyResult.rows[0].consistent_count as string, 10);
    const consistency = (consistentCount / totalRows) * 100;

    // Calculate timeliness: based on how recently data was updated
    const timelinessResult = await pool.query(
      `SELECT MAX(updated_at) AS latest_update, MIN(updated_at) AS oldest_update
       FROM ${sanitizeIdentifier(tableName)}`,
    );

    let timeliness = 0;
    if (timelinessResult.rows[0].latest_update) {
      const latestUpdate = new Date(timelinessResult.rows[0].latest_update as string);
      const now = new Date();
      const hoursStale = (now.getTime() - latestUpdate.getTime()) / (1000 * 60 * 60);
      // Freshness decays over 72 hours: 100% if updated within the hour, 0% after 72 hours
      timeliness = Math.max(0, Math.min(100, 100 - (hoursStale / 72) * 100));
    }

    // Overall: weighted average
    const overall =
      completeness * 0.3 +
      accuracy * 0.3 +
      consistency * 0.2 +
      timeliness * 0.2;

    const score: DataQualityScore = {
      table: tableName,
      completeness: Math.round(completeness * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
      consistency: Math.round(consistency * 100) / 100,
      timeliness: Math.round(timeliness * 100) / 100,
      overall: Math.round(overall * 100) / 100,
    };

    logger.info('Data quality score calculated', {
      table: tableName,
      overall: score.overall,
    });

    return score;
  }

  /**
   * Aggregate data quality scores across all monitored tables.
   * Results are cached for 15 minutes.
   */
  static async generateDataQualityReport(): Promise<DataQualityScore[]> {
    const cached = await cacheGet<DataQualityScore[]>(CACHE_KEY_QUALITY_REPORT);
    if (cached) {
      return cached;
    }

    const scores: DataQualityScore[] = [];

    for (const tableName of MONITORED_TABLES) {
      try {
        const score = await DataQualityService.calculateDataQuality(tableName);
        scores.push(score);
      } catch (error) {
        logger.error('Failed to calculate data quality for table', {
          table: tableName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await cacheSet(CACHE_KEY_QUALITY_REPORT, scores, CACHE_TTL_QUALITY_REPORT);

    logger.info('Data quality report generated', {
      tablesScored: scores.length,
    });

    return scores;
  }
}

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

/**
 * Sanitize a SQL identifier (table or column name) to prevent injection.
 * Only allows alphanumeric characters and underscores.
 */
function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new ValidationError(`Invalid identifier: "${name}"`);
  }
  return `"${name}"`;
}

/**
 * Return the anonymization method string for a PII type.
 */
function getAnonymizationMethod(piiType: PIIField['pii_type']): string {
  switch (piiType) {
    case 'email':
      return 'sha256_hash';
    case 'name':
      return 'character_masking';
    case 'phone':
      return 'partial_masking';
    case 'ip':
      return 'octet_truncation';
    case 'address':
      return 'sha256_hash';
    case 'financial':
      return 'sha256_hash';
    default:
      return 'unknown';
  }
}

/**
 * Return SQL constraint expressions for accuracy checks on a given table.
 */
function getAccuracyConstraints(tableName: string): string {
  switch (tableName) {
    case 'products':
      return `price >= 0 AND (inventory_quantity IS NULL OR inventory_quantity >= 0)`;
    case 'campaigns':
      return `budget >= 0 AND spent >= 0 AND (end_date IS NULL OR end_date >= start_date)`;
    case 'ad_spend':
      return `amount >= 0`;
    default:
      return '1 = 1';
  }
}

/**
 * Return SQL constraint expressions for consistency checks on a given table.
 */
function getConsistencyConstraints(tableName: string): string {
  switch (tableName) {
    case 'products':
      return `title IS NOT NULL AND price IS NOT NULL AND status IS NOT NULL`;
    case 'campaigns':
      return `name IS NOT NULL AND platform IS NOT NULL AND status IS NOT NULL`;
    case 'ad_spend':
      return `campaign_id IS NOT NULL AND platform IS NOT NULL AND amount IS NOT NULL`;
    default:
      return '1 = 1';
  }
}

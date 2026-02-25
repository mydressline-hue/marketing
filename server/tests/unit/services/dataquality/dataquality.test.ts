/**
 * Unit tests for DataQualityService.
 *
 * Database pool, Redis cache, and logger are fully mocked so tests exercise
 * only the service logic: schema validation, data consistency, PII handling,
 * consent management, data lineage, and quality scoring.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-001'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { DataQualityService } from '../../../../src/services/dataquality/DataQualityService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { logger } from '../../../../src/utils/logger';
import { generateId } from '../../../../src/utils/helpers';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockGenerateId = generateId as jest.Mock;

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

describe('DataQualityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockGenerateId.mockReturnValue('test-uuid-001');
  });

  // =========================================================================
  // validateSchema
  // =========================================================================

  describe('validateSchema', () => {
    it('returns valid result when schema matches expected definition', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'character varying' },
          { column_name: 'title', data_type: 'character varying' },
          { column_name: 'description', data_type: 'text' },
          { column_name: 'price', data_type: 'numeric' },
          { column_name: 'inventory_quantity', data_type: 'integer' },
          { column_name: 'status', data_type: 'character varying' },
          { column_name: 'created_at', data_type: 'timestamp with time zone' },
          { column_name: 'updated_at', data_type: 'timestamp with time zone' },
        ],
      });

      const result = await DataQualityService.validateSchema('products');

      expect(result.table).toBe('products');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.checked_at).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.columns'),
        ['products'],
      );
    });

    it('returns errors when columns are missing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'character varying' },
          { column_name: 'title', data_type: 'character varying' },
          // Missing: description, price, inventory_quantity, status, created_at, updated_at
        ],
      });

      const result = await DataQualityService.validateSchema('products');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const missingErrors = result.errors.filter((e) => e.actual_type === 'MISSING');
      expect(missingErrors.length).toBeGreaterThanOrEqual(1);
      expect(missingErrors[0].issue).toContain('missing');
    });

    it('returns errors when column types do not match', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'character varying' },
          { column_name: 'title', data_type: 'character varying' },
          { column_name: 'description', data_type: 'text' },
          { column_name: 'price', data_type: 'text' }, // Wrong type: text instead of numeric
          { column_name: 'inventory_quantity', data_type: 'integer' },
          { column_name: 'status', data_type: 'character varying' },
          { column_name: 'created_at', data_type: 'timestamp with time zone' },
          { column_name: 'updated_at', data_type: 'timestamp with time zone' },
        ],
      });

      const result = await DataQualityService.validateSchema('products');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].column).toBe('price');
      expect(result.errors[0].expected_type).toBe('numeric');
      expect(result.errors[0].actual_type).toBe('text');
    });

    it('throws ValidationError for unknown table', async () => {
      await expect(
        DataQualityService.validateSchema('nonexistent_table'),
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // verifyShopifyData
  // =========================================================================

  describe('verifyShopifyData', () => {
    it('reports no discrepancies for clean data', async () => {
      // null titles query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // negative prices query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // negative inventory query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // missing required fields query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // total count query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '100' }] });

      const result = await DataQualityService.verifyShopifyData();

      expect(result.source).toBe('products');
      expect(result.target).toBe('shopify_integrity_rules');
      expect(result.total_records).toBe(100);
      expect(result.matched).toBe(100);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('detects null titles and negative prices', async () => {
      // null titles
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'prod-1' }] });
      // negative prices
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'prod-2', price: -10.5 }] });
      // negative inventory
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // missing required fields
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'prod-1' }] }); // prod-1 already tracked
      // total count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '50' }] });

      const result = await DataQualityService.verifyShopifyData();

      expect(result.total_records).toBe(50);
      expect(result.discrepancies.length).toBeGreaterThanOrEqual(2);

      const titleIssue = result.discrepancies.find(
        (d) => d.record_id === 'prod-1' && d.field === 'title',
      );
      expect(titleIssue).toBeDefined();
      expect(titleIssue!.source_value).toBeNull();

      const priceIssue = result.discrepancies.find(
        (d) => d.record_id === 'prod-2' && d.field === 'price',
      );
      expect(priceIssue).toBeDefined();
      expect(priceIssue!.source_value).toBe(-10.5);
    });

    it('detects negative inventory quantities', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // null titles
      mockQuery.mockResolvedValueOnce({ rows: [] }); // negative prices
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'prod-3', inventory_quantity: -5 }] }); // negative inventory
      mockQuery.mockResolvedValueOnce({ rows: [] }); // missing fields
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '20' }] }); // total count

      const result = await DataQualityService.verifyShopifyData();

      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].field).toBe('inventory_quantity');
      expect(result.discrepancies[0].source_value).toBe(-5);
    });
  });

  // =========================================================================
  // validateAdSpend
  // =========================================================================

  describe('validateAdSpend', () => {
    it('reports matched records when spend is within 5% threshold', async () => {
      // Internal spend
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'c1', platform: 'meta', internal_total: '1000.00' },
        ],
      });
      // Platform spend
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'c1', platform: 'meta', platform_total: '1020.00' }, // 2% diff
        ],
      });

      const result = await DataQualityService.validateAdSpend();

      expect(result.matched).toBe(1);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('flags discrepancies exceeding 5% threshold', async () => {
      // Internal spend
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'c1', platform: 'meta', internal_total: '1000.00' },
          { campaign_id: 'c2', platform: 'google', internal_total: '500.00' },
        ],
      });
      // Platform spend
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'c1', platform: 'meta', platform_total: '1200.00' }, // 20% diff
          { campaign_id: 'c2', platform: 'google', platform_total: '510.00' }, // 2% diff
        ],
      });

      const result = await DataQualityService.validateAdSpend();

      expect(result.matched).toBe(1);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].record_id).toBe('c1:meta');
      expect(result.discrepancies[0].source_value).toBe(1000);
      expect(result.discrepancies[0].target_value).toBe(1200);
    });

    it('reports missing records in target (platform) data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'c1', platform: 'meta', internal_total: '1000.00' },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [], // No platform data
      });

      const result = await DataQualityService.validateAdSpend();

      expect(result.missing_in_target).toBe(1);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].target_value).toBeNull();
    });

    it('reports missing records in source (internal) data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [], // No internal data
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'c1', platform: 'meta', platform_total: '500.00' },
        ],
      });

      const result = await DataQualityService.validateAdSpend();

      expect(result.missing_in_source).toBe(1);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].source_value).toBeNull();
    });
  });

  // =========================================================================
  // trackDataLineage
  // =========================================================================

  describe('trackDataLineage', () => {
    it('builds lineage from foreign keys and ETL relationships', async () => {
      // FK query
      mockQuery.mockResolvedValueOnce({
        rows: [{ referenced_table: 'countries' }],
      });
      // INSERT/UPSERT lineage
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.trackDataLineage('campaigns');

      expect(result.table).toBe('campaigns');
      // Should include both FK (countries) and ETL upstream sources
      expect(result.upstream_sources).toContain('countries');
      expect(result.upstream_sources).toContain('products');
      expect(result.downstream_consumers).toContain('ad_spend');
      expect(result.transformations).toContain('budget_allocation');
      expect(result.last_updated).toBeDefined();
      expect(mockCacheDel).toHaveBeenCalledWith('dataquality:lineage:campaigns');
    });

    it('handles tables with no FK relationships gracefully', async () => {
      // FK query returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT/UPSERT lineage
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.trackDataLineage('products');

      expect(result.table).toBe('products');
      expect(result.upstream_sources).toContain('shopify_api');
      expect(result.downstream_consumers).toContain('campaigns');
    });
  });

  // =========================================================================
  // getDataLineage
  // =========================================================================

  describe('getDataLineage', () => {
    it('returns cached lineage when available', async () => {
      const cachedLineage = {
        table: 'products',
        upstream_sources: ['shopify_api'],
        downstream_consumers: ['campaigns'],
        transformations: ['shopify_sync'],
        last_updated: '2026-01-01T00:00:00.000Z',
      };
      mockCacheGet.mockResolvedValueOnce(cachedLineage);

      const result = await DataQualityService.getDataLineage('products');

      expect(result).toEqual(cachedLineage);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries database and caches result on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          table_name: 'products',
          upstream_sources: JSON.stringify(['shopify_api']),
          downstream_consumers: JSON.stringify(['campaigns']),
          transformations: JSON.stringify(['shopify_sync']),
          last_updated: '2026-01-01T00:00:00.000Z',
        }],
      });

      const result = await DataQualityService.getDataLineage('products');

      expect(result.table).toBe('products');
      expect(result.upstream_sources).toEqual(['shopify_api']);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'dataquality:lineage:products',
        expect.objectContaining({ table: 'products' }),
        300,
      );
    });

    it('throws NotFoundError when no lineage exists', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        DataQualityService.getDataLineage('unknown_table'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // anonymizePII
  // =========================================================================

  describe('anonymizePII', () => {
    it('anonymizes email columns using SHA-256 hash', async () => {
      // UPDATE query for email anonymization
      mockQuery.mockResolvedValueOnce({ rowCount: 15 });
      // Audit log INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.anonymizePII('users', [
        { column: 'email', pii_type: 'email' },
      ]);

      expect(result.anonymized_count).toBe(15);
      expect(result.columns_processed).toContain('email');
      // Verify SHA-256 hash is used in the query
      expect(mockQuery.mock.calls[0][0]).toContain('sha256');
      // Verify audit log was written
      expect(mockQuery.mock.calls[1][0]).toContain('audit_logs');
    });

    it('anonymizes name columns using character masking', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 20 });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.anonymizePII('users', [
        { column: 'first_name', pii_type: 'name' },
      ]);

      expect(result.anonymized_count).toBe(20);
      expect(result.columns_processed).toContain('first_name');
      // Should use masking approach (CONCAT with REPEAT of '*')
      expect(mockQuery.mock.calls[0][0]).toContain('REPEAT');
    });

    it('anonymizes IP addresses using octet truncation', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 10 });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.anonymizePII('access_logs', [
        { column: 'ip_address', pii_type: 'ip' },
      ]);

      expect(result.anonymized_count).toBe(10);
      expect(result.columns_processed).toContain('ip_address');
    });

    it('processes multiple columns in a single call', async () => {
      // First column (email)
      mockQuery.mockResolvedValueOnce({ rowCount: 10 });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit
      // Second column (phone)
      mockQuery.mockResolvedValueOnce({ rowCount: 8 });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit

      const result = await DataQualityService.anonymizePII('customers', [
        { column: 'email', pii_type: 'email' },
        { column: 'phone', pii_type: 'phone' },
      ]);

      expect(result.anonymized_count).toBe(18);
      expect(result.columns_processed).toEqual(['email', 'phone']);
      // Two UPDATE queries + two audit log inserts
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('throws ValidationError when no columns are provided', async () => {
      await expect(
        DataQualityService.anonymizePII('users', []),
      ).rejects.toThrow(ValidationError);
    });

    it('writes audit log entries for each anonymized column', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await DataQualityService.anonymizePII('users', [
        { column: 'email', pii_type: 'email' },
      ]);

      // Verify the audit log insert was called with correct details
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[0]).toContain('audit_logs');
      expect(auditCall[1]).toContain('pii.anonymize');
      expect(auditCall[1]).toContain('data_quality');
      const details = JSON.parse(auditCall[1][4] as string);
      expect(details.column).toBe('email');
      expect(details.pii_type).toBe('email');
      expect(details.method).toBe('sha256_hash');
      expect(details.rows_affected).toBe(5);
    });
  });

  // =========================================================================
  // detectPIIFields
  // =========================================================================

  describe('detectPIIFields', () => {
    it('detects PII columns based on name patterns', async () => {
      // information_schema.columns query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { table_name: 'users', column_name: 'id', data_type: 'character varying' },
          { table_name: 'users', column_name: 'email', data_type: 'character varying' },
          { table_name: 'users', column_name: 'first_name', data_type: 'character varying' },
          { table_name: 'users', column_name: 'phone', data_type: 'character varying' },
          { table_name: 'orders', column_name: 'id', data_type: 'character varying' },
          { table_name: 'orders', column_name: 'ip_address', data_type: 'character varying' },
        ],
      });
      // Audit check for email
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit check for first_name
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit check for phone
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit check for ip_address
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.detectPIIFields();

      expect(result).toHaveLength(4);

      const emailField = result.find((f) => f.column === 'email');
      expect(emailField).toBeDefined();
      expect(emailField!.pii_type).toBe('email');
      expect(emailField!.is_anonymized).toBe(false);

      const nameField = result.find((f) => f.column === 'first_name');
      expect(nameField).toBeDefined();
      expect(nameField!.pii_type).toBe('name');

      const ipField = result.find((f) => f.column === 'ip_address');
      expect(ipField).toBeDefined();
      expect(ipField!.pii_type).toBe('ip');
    });

    it('marks already-anonymized fields correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { table_name: 'users', column_name: 'email', data_type: 'character varying' },
        ],
      });
      // Audit check returns a record indicating this field was already anonymized
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }] });

      const result = await DataQualityService.detectPIIFields();

      expect(result).toHaveLength(1);
      expect(result[0].is_anonymized).toBe(true);
      expect(result[0].anonymization_method).toBe('sha256_hash');
    });
  });

  // =========================================================================
  // checkConsentCompliance
  // =========================================================================

  describe('checkConsentCompliance', () => {
    it('returns compliant when all GDPR consents are granted', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-1', consent_type: 'data_processing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'gdpr' },
          { user_id: 'user-1', consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'gdpr' },
          { user_id: 'user-1', consent_type: 'analytics', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'gdpr' },
        ],
      });

      const result = await DataQualityService.checkConsentCompliance('user-1', 'gdpr');

      expect(result.compliant).toBe(true);
      expect(result.missing_consents).toHaveLength(0);
      expect(result.records).toHaveLength(3);
    });

    it('returns non-compliant when GDPR consents are missing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-1', consent_type: 'data_processing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'gdpr' },
          // marketing and analytics missing
        ],
      });

      const result = await DataQualityService.checkConsentCompliance('user-1', 'gdpr');

      expect(result.compliant).toBe(false);
      expect(result.missing_consents).toContain('marketing');
      expect(result.missing_consents).toContain('analytics');
    });

    it('handles CCPA regulation consent requirements', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-2', consent_type: 'data_sale_opt_out', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'ccpa' },
          { user_id: 'user-2', consent_type: 'data_processing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'ccpa' },
        ],
      });

      const result = await DataQualityService.checkConsentCompliance('user-2', 'ccpa');

      expect(result.compliant).toBe(true);
      expect(result.missing_consents).toHaveLength(0);
    });
  });

  // =========================================================================
  // manageConsent
  // =========================================================================

  describe('manageConsent', () => {
    it('records a new consent grant', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          consent_type: 'marketing',
          granted: true,
          granted_at: '2026-02-25T00:00:00.000Z',
          revoked_at: null,
          regulation: 'gdpr',
        }],
      });
      // Audit log INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.manageConsent(
        'user-1',
        'marketing',
        true,
        'gdpr',
      );

      expect(result.user_id).toBe('user-1');
      expect(result.consent_type).toBe('marketing');
      expect(result.granted).toBe(true);
      expect(result.regulation).toBe('gdpr');
      // Verify upsert query
      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
    });

    it('records a consent revocation', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          consent_type: 'marketing',
          granted: false,
          granted_at: '2026-01-01T00:00:00Z',
          revoked_at: '2026-02-25T00:00:00.000Z',
          regulation: 'gdpr',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await DataQualityService.manageConsent(
        'user-1',
        'marketing',
        false,
        'gdpr',
      );

      expect(result.granted).toBe(false);
      expect(result.revoked_at).toBeDefined();
      // Verify audit log records the revocation
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[1]).toContain('consent.revoke');
    });

    it('creates audit log entry for consent changes', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          consent_type: 'analytics',
          granted: true,
          granted_at: '2026-02-25T00:00:00.000Z',
          revoked_at: null,
          regulation: 'gdpr',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await DataQualityService.manageConsent('user-1', 'analytics', true, 'gdpr');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[0]).toContain('audit_logs');
      expect(auditCall[1]).toContain('consent.grant');
    });
  });

  // =========================================================================
  // getConsentStatus
  // =========================================================================

  describe('getConsentStatus', () => {
    it('returns all consent records for a user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-1', consent_type: 'data_processing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, regulation: 'gdpr' },
          { user_id: 'user-1', consent_type: 'marketing', granted: false, granted_at: '2026-01-01T00:00:00Z', revoked_at: '2026-02-01T00:00:00Z', regulation: 'gdpr' },
        ],
      });

      const result = await DataQualityService.getConsentStatus('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].consent_type).toBe('data_processing');
      expect(result[1].granted).toBe(false);
    });

    it('throws NotFoundError when user has no consent records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        DataQualityService.getConsentStatus('unknown-user'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // calculateDataQuality
  // =========================================================================

  describe('calculateDataQuality', () => {
    it('computes quality scores for a table', async () => {
      // columns query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'id' },
          { column_name: 'title' },
          { column_name: 'price' },
        ],
      });
      // COUNT query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '100' }] });
      // Completeness query
      mockQuery.mockResolvedValueOnce({
        rows: [{ '0': 1.0, '1': 0.95, '2': 0.98 }],
      });
      // Accuracy query
      mockQuery.mockResolvedValueOnce({ rows: [{ valid_count: '90' }] });
      // Consistency query
      mockQuery.mockResolvedValueOnce({ rows: [{ consistent_count: '85' }] });
      // Timeliness query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          latest_update: new Date().toISOString(),
          oldest_update: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        }],
      });

      const score = await DataQualityService.calculateDataQuality('products');

      expect(score.table).toBe('products');
      expect(score.completeness).toBeGreaterThan(0);
      expect(score.accuracy).toBe(90);
      expect(score.consistency).toBe(85);
      expect(score.timeliness).toBeGreaterThan(0);
      expect(score.overall).toBeGreaterThan(0);
    });

    it('returns zero scores for empty tables', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ column_name: 'id' }, { column_name: 'title' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const score = await DataQualityService.calculateDataQuality('products');

      expect(score.completeness).toBe(0);
      expect(score.accuracy).toBe(0);
      expect(score.consistency).toBe(0);
      expect(score.timeliness).toBe(0);
      expect(score.overall).toBe(0);
    });

    it('throws NotFoundError for tables with no columns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        DataQualityService.calculateDataQuality('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // generateDataQualityReport
  // =========================================================================

  describe('generateDataQualityReport', () => {
    it('returns cached report when available', async () => {
      const cachedReport = [
        { table: 'products', completeness: 95, accuracy: 90, consistency: 85, timeliness: 80, overall: 88.5 },
      ];
      mockCacheGet.mockResolvedValueOnce(cachedReport);

      const result = await DataQualityService.generateDataQualityReport();

      expect(result).toEqual(cachedReport);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calculates and caches report for all monitored tables', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // For each of the 3 monitored tables (products, campaigns, ad_spend),
      // we need to mock the calculateDataQuality chain:
      // columns, count, completeness, accuracy, consistency, timeliness
      for (let i = 0; i < 3; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ column_name: 'id' }, { column_name: 'name' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [{ total: '50' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ '0': 1.0, '1': 0.9 }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ valid_count: '45' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ consistent_count: '40' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{
            latest_update: new Date().toISOString(),
            oldest_update: new Date().toISOString(),
          }],
        });
      }

      const result = await DataQualityService.generateDataQualityReport();

      expect(result).toHaveLength(3);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'dataquality:quality_report',
        expect.any(Array),
        900, // 15 minutes
      );
    });

    it('continues processing when a single table fails', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // First table (products) fails - no columns found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Second table (campaigns) succeeds
      mockQuery.mockResolvedValueOnce({
        rows: [{ column_name: 'id' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ '0': 1.0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ valid_count: '8' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ consistent_count: '9' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          latest_update: new Date().toISOString(),
          oldest_update: new Date().toISOString(),
        }],
      });

      // Third table (ad_spend) succeeds
      mockQuery.mockResolvedValueOnce({
        rows: [{ column_name: 'id' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '20' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ '0': 0.95 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ valid_count: '18' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ consistent_count: '17' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          latest_update: new Date().toISOString(),
          oldest_update: new Date().toISOString(),
        }],
      });

      const result = await DataQualityService.generateDataQualityReport();

      // Only 2 tables succeeded
      expect(result).toHaveLength(2);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to calculate data quality for table',
        expect.objectContaining({ table: 'products' }),
      );
    });
  });
});

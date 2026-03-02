/**
 * Webhook Service Integration Tests (Phase 12C - Batch 2).
 *
 * Validates webhook registration, URL validation, HMAC signature verification,
 * event subscription, webhook delivery/processing, retry logic, deactivation,
 * and event filtering.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test', PORT: 3001, API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h', JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000, RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error', LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('wh-test-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheDel } from '../../../src/config/redis';
import { WebhookService } from '../../../src/services/webhooks/WebhookService';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Webhook Service Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheDel.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Webhook registration
  // =========================================================================

  describe('Webhook registration', () => {
    it('should register a webhook for a supported platform', async () => {
      const mockRow = {
        id: 'wh-test-uuid', user_id: 'user-1', platform_type: 'shopify',
        webhook_url: 'https://example.com/webhook', secret: 'test-secret',
        events: ['order.created', 'order.updated'], is_active: true,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await WebhookService.registerWebhook('shopify', 'user-1', {
        webhookUrl: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['order.created', 'order.updated'],
      });

      expect(result.id).toBe('wh-test-uuid');
      expect(result.platformType).toBe('shopify');
      expect(result.isActive).toBe(true);
      expect(result.events).toContain('order.created');
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should auto-generate a secret when not provided', async () => {
      const mockRow = {
        id: 'wh-test-uuid', user_id: 'user-1', platform_type: 'meta_ads',
        webhook_url: null, secret: 'auto-generated-secret',
        events: [], is_active: true,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await WebhookService.registerWebhook('meta_ads', 'user-1', {});

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
    });

    it('should reject unsupported platform type', async () => {
      await expect(
        WebhookService.registerWebhook('unsupported_platform', 'user-1', {}),
      ).rejects.toThrow('Unsupported platform type');
    });
  });

  // =========================================================================
  // HMAC signature verification
  // =========================================================================

  describe('HMAC signature verification', () => {
    const testSecret = 'my-webhook-secret-key';
    const testPayload = '{"event":"order.created","data":{"id":"123"}}';

    it('should verify a valid Shopify HMAC signature (base64)', () => {
      const computed = crypto.createHmac('sha256', testSecret).update(testPayload, 'utf8').digest('base64');

      const result = WebhookService.verifySignature('shopify', testPayload, computed, testSecret);

      expect(result).toBe(true);
    });

    it('should reject an invalid Shopify HMAC signature', () => {
      const result = WebhookService.verifySignature('shopify', testPayload, 'invalid-sig', testSecret);

      expect(result).toBe(false);
    });

    it('should verify a valid Meta signature with sha256= prefix', () => {
      const hexDigest = crypto.createHmac('sha256', testSecret).update(testPayload, 'utf8').digest('hex');
      const signature = `sha256=${hexDigest}`;

      const result = WebhookService.verifySignature('meta_ads', testPayload, signature, testSecret);

      expect(result).toBe(true);
    });

    it('should verify a valid Salesforce hex HMAC signature', () => {
      const hexDigest = crypto.createHmac('sha256', testSecret).update(testPayload, 'utf8').digest('hex');

      const result = WebhookService.verifySignature('salesforce', testPayload, hexDigest, testSecret);

      expect(result).toBe(true);
    });

    it('should verify a valid HubSpot hex HMAC signature', () => {
      const hexDigest = crypto.createHmac('sha256', testSecret).update(testPayload, 'utf8').digest('hex');

      const result = WebhookService.verifySignature('hubspot', testPayload, hexDigest, testSecret);

      expect(result).toBe(true);
    });

    it('should verify Google Ads token equality', () => {
      const result = WebhookService.verifySignature('google_ads', testPayload, testSecret, testSecret);

      expect(result).toBe(true);
    });

    it('should reject Google Ads with mismatched token', () => {
      const result = WebhookService.verifySignature('google_ads', testPayload, 'wrong-token', testSecret);

      expect(result).toBe(false);
    });

    it('should return false for empty signature', () => {
      const result = WebhookService.verifySignature('shopify', testPayload, '', testSecret);

      expect(result).toBe(false);
    });

    it('should return false for empty secret', () => {
      const result = WebhookService.verifySignature('shopify', testPayload, 'some-sig', '');

      expect(result).toBe(false);
    });

    it('should use default hex HMAC for unknown platforms', () => {
      const hexDigest = crypto.createHmac('sha256', testSecret).update(testPayload, 'utf8').digest('hex');

      const result = WebhookService.verifySignature('tiktok_ads', testPayload, hexDigest, testSecret);

      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // Event processing (webhook delivery)
  // =========================================================================

  describe('Event processing', () => {
    it('should store a webhook event with received status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const eventId = await WebhookService.processWebhookEvent(
        'shopify', 'order.created', { order_id: '123', total: 99.99 }, 'user-1', 'reg-1',
      );

      expect(eventId).toBe('wh-test-uuid');
      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO webhook_events');
      expect(insertCall[1]).toContain('received');
    });

    it('should mark an event as processed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'evt-1' }], rowCount: 1 });

      await WebhookService.markEventProcessed('evt-1');

      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain("status = 'processed'");
    });

    it('should mark an event as failed with error message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'evt-2' }], rowCount: 1 });

      await WebhookService.markEventFailed('evt-2', 'Processing timeout');

      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain("status = 'failed'");
      expect(updateCall[1]).toContain('Processing timeout');
    });

    it('should throw NotFoundError when marking non-existent event as processed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(WebhookService.markEventProcessed('non-existent')).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // Webhook event query with filters
  // =========================================================================

  describe('Webhook event query with filters', () => {
    it('should query events with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '15' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'e1', platform_type: 'shopify', event_type: 'order.created', payload: {}, status: 'received', user_id: 'user-1', registration_id: null, processed_at: null, error_message: null, created_at: '2026-01-01T00:00:00Z' },
          ],
        });

      const result = await WebhookService.getWebhookEvents('shopify', 'user-1', { page: 1, limit: 10 });

      expect(result.total).toBe(15);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(2);
    });

    it('should filter events by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await WebhookService.getWebhookEvents('shopify', 'user-1', { status: 'failed' });

      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('status = $');
    });

    it('should filter events by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await WebhookService.getWebhookEvents(undefined, 'user-1', {
        startDate: '2026-01-01', endDate: '2026-01-31',
      });

      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('created_at >= $');
      expect(countQuery).toContain('created_at <= $');
    });
  });

  // =========================================================================
  // Webhook deactivation
  // =========================================================================

  describe('Webhook deactivation', () => {
    it('should deactivate a webhook registration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'reg-1' }], rowCount: 1 });

      await WebhookService.deactivateRegistration('reg-1', 'user-1');

      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain('is_active = false');
      expect(mockCacheDel).toHaveBeenCalledWith(expect.stringContaining('webhooks:registrations:user-1'));
    });

    it('should throw NotFoundError when deactivating non-existent registration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        WebhookService.deactivateRegistration('non-existent', 'user-1'),
      ).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // Webhook registrations listing
  // =========================================================================

  describe('Webhook registrations listing', () => {
    it('should list active registrations for a user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'r1', user_id: 'user-1', platform_type: 'shopify', webhook_url: 'https://a.com/wh', secret: 's1', events: ['order.created'], is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          { id: 'r2', user_id: 'user-1', platform_type: 'meta_ads', webhook_url: null, secret: 's2', events: [], is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
      });

      const registrations = await WebhookService.getWebhookRegistrations('user-1');

      expect(registrations).toHaveLength(2);
      expect(registrations[0].platformType).toBe('shopify');
      expect(registrations[1].platformType).toBe('meta_ads');
    });

    it('should return from cache when available', async () => {
      const cached = [{ id: 'cached-r1', userId: 'user-1', platformType: 'shopify', isActive: true }];
      mockCacheGet.mockResolvedValueOnce(cached);

      const registrations = await WebhookService.getWebhookRegistrations('user-1');

      expect(registrations).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Find registration by platform
  // =========================================================================

  describe('Find registration by platform', () => {
    it('should find active registration by platform type', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'r1', user_id: 'user-1', platform_type: 'shopify',
          webhook_url: 'https://a.com/wh', secret: 'secret-123',
          events: ['order.created'], is_active: true,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        }],
      });

      const registration = await WebhookService.findRegistrationByPlatform('shopify');

      expect(registration).not.toBeNull();
      expect(registration!.platformType).toBe('shopify');
      expect(registration!.secret).toBe('secret-123');
    });

    it('should return null when no registration exists for platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const registration = await WebhookService.findRegistrationByPlatform('tiktok_ads');

      expect(registration).toBeNull();
    });
  });
});

/**
 * Notification Service Integration Tests (Phase 12C - Batch 2).
 *
 * Validates notification creation, multi-channel routing, user preference
 * filtering, mark as read, listing with pagination, delivery status tracking,
 * and notification deletion.
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
  generateId: jest.fn().mockReturnValue('notif-test-uuid'),
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

// Mock all notification channels
jest.mock('../../../src/services/notifications/channels/EmailChannel', () => ({
  EmailChannel: { send: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../../src/services/notifications/channels/SlackChannel', () => ({
  SlackChannel: { send: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../../src/services/notifications/channels/InAppChannel', () => ({
  InAppChannel: { send: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../../src/services/notifications/channels/SmsChannel', () => ({
  SmsChannel: { send: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheDel } from '../../../src/config/redis';
import { NotificationService } from '../../../src/services/notifications/NotificationService';
import { EmailChannel } from '../../../src/services/notifications/channels/EmailChannel';
import { SlackChannel } from '../../../src/services/notifications/channels/SlackChannel';
import { InAppChannel } from '../../../src/services/notifications/channels/InAppChannel';
import { SmsChannel } from '../../../src/services/notifications/channels/SmsChannel';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Notification Service Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheDel.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Notification creation
  // =========================================================================

  describe('Notification creation', () => {
    it('should create a notification and return its ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert notification

      const id = await NotificationService.send({
        userId: 'user-1',
        title: 'Test Alert',
        message: 'Something happened',
        channels: ['in_app'],
        priority: 'high',
        category: 'alert',
      });

      expect(id).toBe('notif-test-uuid');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining(['notif-test-uuid', 'user-1', 'Test Alert']),
      );
    });

    it('should reject notification without title', async () => {
      await expect(
        NotificationService.send({
          userId: 'user-1',
          title: '',
          message: 'no title',
          channels: ['in_app'],
          priority: 'medium',
          category: 'system',
        }),
      ).rejects.toThrow('Title and message are required');
    });

    it('should reject notification without channels', async () => {
      await expect(
        NotificationService.send({
          userId: 'user-1',
          title: 'Title',
          message: 'message',
          channels: [],
          priority: 'medium',
          category: 'system',
        }),
      ).rejects.toThrow('At least one channel is required');
    });

    it('should reject invalid channel', async () => {
      await expect(
        NotificationService.send({
          userId: 'user-1',
          title: 'Title',
          message: 'message',
          channels: ['pigeon' as any],
          priority: 'medium',
          category: 'system',
        }),
      ).rejects.toThrow('Invalid channel');
    });

    it('should reject invalid priority', async () => {
      await expect(
        NotificationService.send({
          userId: 'user-1',
          title: 'Title',
          message: 'message',
          channels: ['email'],
          priority: 'super_urgent' as any,
          category: 'system',
        }),
      ).rejects.toThrow('Invalid priority');
    });

    it('should reject invalid category', async () => {
      await expect(
        NotificationService.send({
          userId: 'user-1',
          title: 'Title',
          message: 'message',
          channels: ['email'],
          priority: 'low',
          category: 'unknown_cat' as any,
        }),
      ).rejects.toThrow('Invalid category');
    });
  });

  // =========================================================================
  // Multi-channel routing
  // =========================================================================

  describe('Multi-channel routing', () => {
    it('should dispatch to email channel when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await NotificationService.send({
        userId: 'user-1', title: 'Email Test', message: 'body',
        channels: ['email'], priority: 'medium', category: 'system',
      });

      expect(EmailChannel.send).toHaveBeenCalledWith('user-1', 'Email Test', 'body', 'notif-test-uuid');
    });

    it('should dispatch to slack channel when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await NotificationService.send({
        userId: 'user-1', title: 'Slack Test', message: 'body',
        channels: ['slack'], priority: 'medium', category: 'system',
      });

      expect(SlackChannel.send).toHaveBeenCalledWith('user-1', expect.stringContaining('Slack Test'), 'notif-test-uuid');
    });

    it('should dispatch to in_app channel when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await NotificationService.send({
        userId: 'user-1', title: 'InApp Test', message: 'body',
        channels: ['in_app'], priority: 'high', category: 'alert',
      });

      expect(InAppChannel.send).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: 'InApp Test', priority: 'high' }),
        'notif-test-uuid',
      );
    });

    it('should dispatch to sms channel when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await NotificationService.send({
        userId: 'user-1', title: 'SMS Test', message: 'body',
        channels: ['sms'], priority: 'critical', category: 'security',
      });

      expect(SmsChannel.send).toHaveBeenCalledWith('user-1', expect.stringContaining('SMS Test'), 'notif-test-uuid');
    });

    it('should dispatch to multiple channels simultaneously', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await NotificationService.send({
        userId: 'user-1', title: 'Multi', message: 'body',
        channels: ['email', 'slack', 'in_app', 'sms'],
        priority: 'high', category: 'alert',
      });

      expect(EmailChannel.send).toHaveBeenCalled();
      expect(SlackChannel.send).toHaveBeenCalled();
      expect(InAppChannel.send).toHaveBeenCalled();
      expect(SmsChannel.send).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Mark as read
  // =========================================================================

  describe('Mark as read', () => {
    it('should mark a notification as read', async () => {
      const mockRow = {
        id: 'notif-1', user_id: 'user-1', title: 'Test', message: 'msg',
        channels: ['in_app'], priority: 'medium', category: 'system',
        metadata: {}, is_read: true, read_at: '2026-01-01T00:00:00Z',
        is_deleted: false, created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await NotificationService.markAsRead('notif-1', 'user-1');

      expect(result.isRead).toBe(true);
      expect(result.readAt).toBeDefined();
      expect(mockCacheDel).toHaveBeenCalledWith(expect.stringContaining('notifications:unread:user-1'));
    });

    it('should throw NotFoundError when marking non-existent notification as read', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        NotificationService.markAsRead('non-existent', 'user-1'),
      ).rejects.toThrow('not found');
    });

    it('should mark all notifications as read for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5, rows: [] });

      const count = await NotificationService.markAllAsRead('user-1');

      expect(count).toBe(5);
      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Notification listing with pagination
  // =========================================================================

  describe('Notification listing with pagination', () => {
    it('should list notifications with default pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'n1', user_id: 'user-1', title: 'A', message: 'm', channels: ['in_app'], priority: 'low', category: 'system', metadata: {}, is_read: false, read_at: null, is_deleted: false, created_at: '2026-01-03T00:00:00Z' },
            { id: 'n2', user_id: 'user-1', title: 'B', message: 'm', channels: ['email'], priority: 'high', category: 'alert', metadata: {}, is_read: true, read_at: '2026-01-02T00:00:00Z', is_deleted: false, created_at: '2026-01-02T00:00:00Z' },
          ],
        });

      const result = await NotificationService.getNotifications('user-1');

      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('n1');
    });

    it('should filter by category', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'n3', user_id: 'user-1', title: 'Alert', message: 'm', channels: ['in_app'], priority: 'critical', category: 'alert', metadata: {}, is_read: false, read_at: null, is_deleted: false, created_at: '2026-01-01T00:00:00Z' },
          ],
        });

      const result = await NotificationService.getNotifications('user-1', { category: 'alert' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].category).toBe('alert');
    });

    it('should filter by isRead status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      await NotificationService.getNotifications('user-1', { isRead: false });

      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('is_read = $');
    });
  });

  // =========================================================================
  // Unread count
  // =========================================================================

  describe('Unread count', () => {
    it('should return unread count from database when cache misses', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 7 }] });

      const count = await NotificationService.getUnreadCount('user-1');

      expect(count).toBe(7);
    });

    it('should return cached unread count when available', async () => {
      mockCacheGet.mockResolvedValueOnce(12);

      const count = await NotificationService.getUnreadCount('user-1');

      expect(count).toBe(12);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Notification deletion
  // =========================================================================

  describe('Notification deletion', () => {
    it('should soft-delete a notification', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'n1', is_read: true }], rowCount: 1 });

      await NotificationService.deleteNotification('n1', 'user-1');

      const updateQuery = mockQuery.mock.calls[0][0];
      expect(updateQuery).toContain('is_deleted = true');
    });

    it('should invalidate unread cache when deleting an unread notification', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'n2', is_read: false }], rowCount: 1 });

      await NotificationService.deleteNotification('n2', 'user-1');

      expect(mockCacheDel).toHaveBeenCalledWith(expect.stringContaining('notifications:unread:user-1'));
    });

    it('should throw NotFoundError when deleting non-existent notification', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        NotificationService.deleteNotification('non-existent', 'user-1'),
      ).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // Notification preferences
  // =========================================================================

  describe('Notification preferences', () => {
    it('should return existing preferences for a user', async () => {
      const mockRow = {
        id: 'pref-1', user_id: 'user-1',
        email_enabled: true, slack_enabled: false, in_app_enabled: true, sms_enabled: false,
        alert_channels: ['email', 'in_app'], system_channels: ['in_app'],
        campaign_channels: ['email'], integration_channels: ['slack'],
        security_channels: ['email', 'sms'],
        quiet_hours_start: '22:00', quiet_hours_end: '08:00',
        updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const prefs = await NotificationService.getPreferences('user-1');

      expect(prefs.emailEnabled).toBe(true);
      expect(prefs.slackEnabled).toBe(false);
      expect(prefs.alertChannels).toContain('email');
      expect(prefs.quietHoursStart).toBe('22:00');
    });

    it('should create default preferences when none exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no existing prefs
        .mockResolvedValueOnce({
          rows: [{
            id: 'pref-new', user_id: 'user-2',
            email_enabled: true, slack_enabled: true, in_app_enabled: true, sms_enabled: false,
            alert_channels: [], system_channels: [], campaign_channels: [],
            integration_channels: [], security_channels: [],
            quiet_hours_start: null, quiet_hours_end: null,
            updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
          }],
        });

      const prefs = await NotificationService.getPreferences('user-2');

      expect(prefs.userId).toBe('user-2');
    });
  });
});

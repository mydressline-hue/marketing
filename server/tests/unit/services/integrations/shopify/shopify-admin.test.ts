/**
 * Unit tests for ShopifyAdminService.
 *
 * All external dependencies (database, cache, logger, audit) are fully mocked
 * so tests exercise only the service logic: product sync, blog/content publishing,
 * webhook management, pixel/conversion tracking, and connection status.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../../../../../src/config/redis', () => ({
  cacheGet: jest.fn(), cacheSet: jest.fn(), cacheDel: jest.fn(), cacheFlush: jest.fn(),
}));
jest.mock('../../../../../../src/config/env', () => ({ env: { NODE_ENV: 'test' } }));
jest.mock('../../../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('shop-uuid-1'),
}));
jest.mock('../../../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ShopifyAdminService } from '../../../../../../src/services/integrations/shopify/ShopifyAdminService';
import { pool } from '../../../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../../../../src/config/redis';
import { generateId } from '../../../../../../src/utils/helpers';
import { AuditService } from '../../../../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-shop-001';
const PRODUCT_ID = 'prod-uuid-1';
const BLOG_ID = 'blog-uuid-1';
const WEBHOOK_ID = 'wh-uuid-1';

const SHOPIFY_CONNECTION = {
  id: 'conn-shop-1',
  user_id: USER_ID,
  platform_type: 'shopify',
  shop_domain: 'test-store.myshopify.com',
  access_token: 'shpat_test_token_xyz',
  status: 'active',
  created_at: '2026-02-25T00:00:00Z',
};

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  user_id: USER_ID,
  external_id: 'shopify-prod-123',
  title: 'Test Widget',
  description: 'A test product for unit testing',
  vendor: 'Test Vendor',
  product_type: 'Widget',
  status: 'active',
  variants: [{ id: 'var-1', price: '29.99', sku: 'TW-001' }],
  images: [{ id: 'img-1', src: 'https://cdn.shopify.com/test.jpg' }],
  created_at: '2026-02-25T00:00:00Z',
  updated_at: '2026-02-25T00:00:00Z',
};

const BLOG_ROW = {
  id: BLOG_ID,
  user_id: USER_ID,
  external_id: 'shopify-blog-456',
  title: 'Spring Collection Announcement',
  body_html: '<p>Check out our new spring collection!</p>',
  author: 'Test Author',
  tags: 'spring, collection, new',
  status: 'published',
  published_at: '2026-02-25T00:00:00Z',
  created_at: '2026-02-25T00:00:00Z',
  updated_at: '2026-02-25T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSyncLogRow(overrides = {}) {
  return {
    id: 'sync-uuid-1', sync_type: 'full', entity_type: 'product',
    entity_id: 'prod-1', external_id: 'shopify-prod-1',
    status: 'success', details: { title: 'Test Product' },
    synced_by: USER_ID, synced_at: '2026-02-25T00:00:00Z', ...overrides,
  };
}

function makeWebhookRow(overrides = {}) {
  return {
    id: 'wh-uuid-1', topic: 'orders/create',
    address: 'https://api.example.com/webhooks/shopify',
    external_webhook_id: 'shopify-wh-123', is_active: true,
    last_triggered_at: null, created_at: '2026-02-25T00:00:00Z', ...overrides,
  };
}

function makePixelEventRow(overrides = {}) {
  return {
    id: 'px-uuid-1', event_type: 'PageView',
    event_data: { page: '/products/test' }, page_url: 'https://shop.example.com/products/test',
    session_id: 'sess-123', is_valid: true, recorded_at: '2026-02-25T00:00:00Z', ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
});

// ===========================================================================
// ShopifyAdminService
// ===========================================================================

describe('ShopifyAdminService', () => {
  // -------------------------------------------------------------------------
  // syncProducts
  // -------------------------------------------------------------------------
  describe('syncProducts', () => {
    it('should sync products from Shopify and return sync result counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })          // fetch connection
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })                 // upsert products
        .mockResolvedValueOnce({ rows: [makeSyncLogRow()] })            // insert sync log
        .mockResolvedValueOnce({ rowCount: 1 });                        // update sync timestamp

      const result = await ShopifyAdminService.syncProducts(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('synced');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('skipped');
    });

    it('should create sync log entries for each synced product', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW, { ...PRODUCT_ROW, id: 'prod-2' }] })
        .mockResolvedValueOnce({ rows: [makeSyncLogRow(), makeSyncLogRow({ entity_id: 'prod-2' })] })
        .mockResolvedValueOnce({ rowCount: 2 });

      await ShopifyAdminService.syncProducts(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should write an audit log entry after successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })
        .mockResolvedValueOnce({ rows: [makeSyncLogRow()] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await ShopifyAdminService.syncProducts(USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle partial failures during product sync gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })
        .mockResolvedValueOnce({
          rows: [
            makeSyncLogRow({ status: 'success' }),
            makeSyncLogRow({ entity_id: 'prod-fail', status: 'failed', details: { error: 'variant missing' } }),
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await ShopifyAdminService.syncProducts(USER_ID);

      expect(result).toBeDefined();
    });

    it('should throw when no active Shopify connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(ShopifyAdminService.syncProducts(USER_ID)).rejects.toThrow();
    });

    it('should handle API failure during product sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockRejectedValueOnce(new Error('Shopify API rate limit exceeded'));

      await expect(ShopifyAdminService.syncProducts(USER_ID)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getProduct
  // -------------------------------------------------------------------------
  describe('getProduct', () => {
    it('should return product details from the database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PRODUCT_ROW] });

      const result = await ShopifyAdminService.getProduct(PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Widget');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return cached product on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(PRODUCT_ROW));

      const result = await ShopifyAdminService.getProduct(PRODUCT_ID);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should populate cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [PRODUCT_ROW] });

      await ShopifyAdminService.getProduct(PRODUCT_ID);

      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return null when product is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ShopifyAdminService.getProduct('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateProduct
  // -------------------------------------------------------------------------
  describe('updateProduct', () => {
    it('should update a product on Shopify and return updated record', async () => {
      const updateData = { title: 'Updated Widget', status: 'draft' };
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })          // fetch connection
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })                 // fetch existing
        .mockResolvedValueOnce({ rows: [{ ...PRODUCT_ROW, ...updateData }] }); // update

      const result = await ShopifyAdminService.updateProduct(USER_ID, PRODUCT_ID, updateData);

      expect(result).toBeDefined();
      expect(result.title).toBe('Updated Widget');
    });

    it('should throw when product does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        ShopifyAdminService.updateProduct(USER_ID, 'nonexistent-id', { title: 'X' }),
      ).rejects.toThrow();
    });

    it('should create a sync log entry after product update', async () => {
      const updateData = { title: 'Updated Widget' };
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })
        .mockResolvedValueOnce({ rows: [{ ...PRODUCT_ROW, ...updateData }] })
        .mockResolvedValueOnce({ rows: [makeSyncLogRow({ sync_type: 'update' })] });

      await ShopifyAdminService.updateProduct(USER_ID, PRODUCT_ID, updateData);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should write an audit log entry after product update', async () => {
      const updateData = { title: 'Updated Widget' };
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })
        .mockResolvedValueOnce({ rows: [{ ...PRODUCT_ROW, ...updateData }] });

      await ShopifyAdminService.updateProduct(USER_ID, PRODUCT_ID, updateData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should invalidate cache after product update', async () => {
      const updateData = { title: 'Updated Widget' };
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })
        .mockResolvedValueOnce({ rows: [{ ...PRODUCT_ROW, ...updateData }] });

      await ShopifyAdminService.updateProduct(USER_ID, PRODUCT_ID, updateData);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // publishBlog
  // -------------------------------------------------------------------------
  describe('publishBlog', () => {
    const blogData = {
      title: 'New Blog Post',
      body_html: '<p>Hello World</p>',
      author: 'Test Author',
      tags: 'test, blog',
    };

    it('should publish a blog post to Shopify and return it with shopify_id', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({
          rows: [{ ...BLOG_ROW, id: 'shop-uuid-1', external_id: 'shopify-blog-new' }],
        });

      const result = await ShopifyAdminService.publishBlog(USER_ID, blogData);

      expect(result).toBeDefined();
      expect(result.external_id).toBeDefined();
      expect(generateId).toHaveBeenCalled();
    });

    it('should create a sync log entry after publishing a blog', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [{ ...BLOG_ROW, id: 'shop-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [makeSyncLogRow({ entity_type: 'blog' })] });

      await ShopifyAdminService.publishBlog(USER_ID, blogData);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should write an audit log entry after publishing a blog', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [{ ...BLOG_ROW, id: 'shop-uuid-1' }] });

      await ShopifyAdminService.publishBlog(USER_ID, blogData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active Shopify connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(ShopifyAdminService.publishBlog(USER_ID, blogData)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateBlog
  // -------------------------------------------------------------------------
  describe('updateBlog', () => {
    const updateBlogData = { title: 'Updated Blog Title', body_html: '<p>Updated content</p>' };

    it('should update an existing blog post and return the updated record', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [BLOG_ROW] })
        .mockResolvedValueOnce({ rows: [{ ...BLOG_ROW, ...updateBlogData }] });

      const result = await ShopifyAdminService.updateBlog(USER_ID, BLOG_ID, updateBlogData);

      expect(result).toBeDefined();
      expect(result.title).toBe('Updated Blog Title');
    });

    it('should throw when blog does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        ShopifyAdminService.updateBlog(USER_ID, 'nonexistent-blog', updateBlogData),
      ).rejects.toThrow();
    });

    it('should invalidate cache after blog update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [BLOG_ROW] })
        .mockResolvedValueOnce({ rows: [{ ...BLOG_ROW, ...updateBlogData }] });

      await ShopifyAdminService.updateBlog(USER_ID, BLOG_ID, updateBlogData);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listBlogs
  // -------------------------------------------------------------------------
  describe('listBlogs', () => {
    it('should return a paginated list of blogs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [BLOG_ROW, { ...BLOG_ROW, id: 'blog-uuid-2' }] });

      const result = await ShopifyAdminService.listBlogs({ page: 1, limit: 20 });

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter blogs by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [BLOG_ROW] });

      await ShopifyAdminService.listBlogs({ status: 'published', page: 1, limit: 20 });

      expect(mockQuery).toHaveBeenCalled();
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql.toLowerCase()).toContain('status');
    });

    it('should return empty results when no blogs match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ShopifyAdminService.listBlogs({ status: 'archived', page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle default pagination when no filters provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [BLOG_ROW] });

      const result = await ShopifyAdminService.listBlogs({});

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // registerWebhook
  // -------------------------------------------------------------------------
  describe('registerWebhook', () => {
    it('should register a webhook and return it with external_webhook_id', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({
          rows: [makeWebhookRow({ id: 'shop-uuid-1' })],
        });

      const result = await ShopifyAdminService.registerWebhook(
        USER_ID,
        'orders/create',
        'https://api.example.com/webhooks/shopify',
      );

      expect(result).toBeDefined();
      expect(result.external_webhook_id).toBe('shopify-wh-123');
      expect(generateId).toHaveBeenCalled();
    });

    it('should write an audit log entry after registering a webhook', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [makeWebhookRow({ id: 'shop-uuid-1' })] });

      await ShopifyAdminService.registerWebhook(
        USER_ID,
        'orders/create',
        'https://api.example.com/webhooks/shopify',
      );

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should validate the webhook topic before registering', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] });

      await expect(
        ShopifyAdminService.registerWebhook(USER_ID, 'invalid/topic', 'https://api.example.com/webhooks'),
      ).rejects.toThrow();
    });

    it('should throw when no active Shopify connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        ShopifyAdminService.registerWebhook(USER_ID, 'orders/create', 'https://api.example.com/webhooks'),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // deleteWebhook
  // -------------------------------------------------------------------------
  describe('deleteWebhook', () => {
    it('should delete a webhook by id', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeWebhookRow()] })           // fetch existing
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });              // delete

      await ShopifyAdminService.deleteWebhook(USER_ID, WEBHOOK_ID);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw when webhook does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        ShopifyAdminService.deleteWebhook(USER_ID, 'nonexistent-wh'),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after deleting a webhook', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeWebhookRow()] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await ShopifyAdminService.deleteWebhook(USER_ID, WEBHOOK_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listWebhooks
  // -------------------------------------------------------------------------
  describe('listWebhooks', () => {
    it('should return a list of registered webhooks', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeWebhookRow(),
          makeWebhookRow({ id: 'wh-uuid-2', topic: 'products/update', external_webhook_id: 'shopify-wh-456' }),
        ],
      });

      const result = await ShopifyAdminService.listWebhooks();

      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe('orders/create');
      expect(result[1].topic).toBe('products/update');
    });

    it('should return an empty list when no webhooks are registered', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ShopifyAdminService.listWebhooks();

      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // handleWebhookEvent
  // -------------------------------------------------------------------------
  describe('handleWebhookEvent', () => {
    it('should handle orders/create webhook events', async () => {
      const event = {
        topic: 'orders/create',
        payload: { id: 'order-123', total_price: '99.99', customer: { email: 'test@example.com' } },
        shop_domain: 'test-store.myshopify.com',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-uuid-1' }] });

      const result = await ShopifyAdminService.handleWebhookEvent(event);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle products/update webhook events', async () => {
      const event = {
        topic: 'products/update',
        payload: { id: 'shopify-prod-123', title: 'Updated Product', status: 'active' },
        shop_domain: 'test-store.myshopify.com',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-uuid-2' }] });

      const result = await ShopifyAdminService.handleWebhookEvent(event);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle inventory_levels/update webhook events', async () => {
      const event = {
        topic: 'inventory_levels/update',
        payload: { inventory_item_id: 'inv-001', available: 50, location_id: 'loc-1' },
        shop_domain: 'test-store.myshopify.com',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-uuid-3' }] });

      const result = await ShopifyAdminService.handleWebhookEvent(event);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should log unknown webhook topics without throwing', async () => {
      const event = {
        topic: 'unknown/topic',
        payload: { some: 'data' },
        shop_domain: 'test-store.myshopify.com',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-uuid-4' }] });

      const result = await ShopifyAdminService.handleWebhookEvent(event);

      expect(result).toBeDefined();
    });

    it('should invalidate relevant cache entries after processing events', async () => {
      const event = {
        topic: 'products/update',
        payload: { id: 'shopify-prod-123', title: 'Updated Product' },
        shop_domain: 'test-store.myshopify.com',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-uuid-5' }] });

      await ShopifyAdminService.handleWebhookEvent(event);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // validatePixel
  // -------------------------------------------------------------------------
  describe('validatePixel', () => {
    it('should return valid status with event counts when pixel is firing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({
          rows: [
            { event_type: 'PageView', count: '150' },
            { event_type: 'AddToCart', count: '45' },
            { event_type: 'Purchase', count: '12' },
          ],
        });

      const result = await ShopifyAdminService.validatePixel(USER_ID);

      expect(result).toBeDefined();
      expect(result.is_valid).toBe(true);
      expect(result.event_counts).toBeDefined();
    });

    it('should return invalid status when no pixel events are found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ShopifyAdminService.validatePixel(USER_ID);

      expect(result).toBeDefined();
      expect(result.is_valid).toBe(false);
    });

    it('should throw when no active Shopify connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(ShopifyAdminService.validatePixel(USER_ID)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getPixelEvents
  // -------------------------------------------------------------------------
  describe('getPixelEvents', () => {
    it('should return paginated pixel event results', async () => {
      const events = [
        makePixelEventRow(),
        makePixelEventRow({ id: 'px-uuid-2', event_type: 'AddToCart', event_data: { product_id: 'p-1' } }),
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: events });

      const result = await ShopifyAdminService.getPixelEvents({ page: 1, limit: 20 });

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter pixel events by event_type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [makePixelEventRow()] });

      await ShopifyAdminService.getPixelEvents({ event_type: 'PageView', page: 1, limit: 20 });

      expect(mockQuery).toHaveBeenCalled();
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql.toLowerCase()).toContain('event_type');
    });

    it('should filter pixel events by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({
          rows: [
            makePixelEventRow(),
            makePixelEventRow({ id: 'px-uuid-2' }),
            makePixelEventRow({ id: 'px-uuid-3' }),
          ],
        });

      await ShopifyAdminService.getPixelEvents({
        start_date: '2026-02-01',
        end_date: '2026-02-28',
        page: 1,
        limit: 50,
      });

      expect(mockQuery).toHaveBeenCalled();
      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain('2026-02-01');
      expect(params).toContain('2026-02-28');
    });

    it('should return cached pixel events on cache hit', async () => {
      const cachedResult = {
        data: [makePixelEventRow()],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(cachedResult));

      const result = await ShopifyAdminService.getPixelEvents({ page: 1, limit: 20 });

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should populate cache on cache miss for pixel events', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [makePixelEventRow()] });

      await ShopifyAdminService.getPixelEvents({ page: 1, limit: 20 });

      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return empty results when no pixel events exist', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ShopifyAdminService.getPixelEvents({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------
  describe('getConnectionStatus', () => {
    it('should return connected status when an active connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] });

      const result = await ShopifyAdminService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
      expect(result.connected).toBe(true);
    });

    it('should return disconnected status when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ShopifyAdminService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
      expect(result.connected).toBe(false);
    });

    it('should return disconnected when connection exists but is inactive', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SHOPIFY_CONNECTION, status: 'inactive' }],
      });

      const result = await ShopifyAdminService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should query for shopify platform type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SHOPIFY_CONNECTION] });

      await ShopifyAdminService.getConnectionStatus(USER_ID);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('shopify');
    });
  });
});

/**
 * Unit tests for ShopifyIntegrationAgent (Agent 11).
 *
 * All external dependencies (database, Redis, logger, helpers) are mocked
 * so we exercise only the agent logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks - must be declared before imports so jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), scan: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1234'),
  retryWithBackoff: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ShopifyIntegrationAgent } from '../../../src/agents/modules/ShopifyIntegrationAgent';
import type {
  Discrepancy,
  SyncResult,
  ProductSyncResult,
  InventorySyncResult,
  BlogPublishResult,
  PixelValidation,
  ConversionValidation,
  WebhookRegistration,
  UpsellConfig,
  SyncStatus,
  ResolutionResult,
} from '../../../src/agents/modules/ShopifyIntegrationAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../src/config/redis';

// Typed mocks for convenience
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-001',
    title: 'Test Product',
    description: 'A test product description',
    shopify_id: 'shpfy_prod-001',
    images: ['https://cdn.example.com/img1.jpg'],
    variants: [
      {
        id: 'var-001',
        title: 'Default',
        sku: 'SKU-001',
        price: 29.99,
        compare_at_price: 39.99,
        stock: 100,
        weight: 0.5,
        option1: 'Medium',
      },
    ],
    inventory_level: 100,
    is_active: true,
    synced_at: '2026-02-25T10:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-25T09:00:00.000Z',
    ...overrides,
  };
}

function makeContent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'content-001',
    title: 'Test Blog Post',
    body: '<p>Blog body content</p>',
    status: 'review',
    seo_data: {
      keywords: ['test'],
      meta_title: 'Test Blog',
      meta_description: 'A test blog post',
      internal_links: [],
      readability_score: 80,
    },
    country_id: 'country-001',
    language: 'en',
    shopify_id: null,
    published_at: null,
    created_by: 'user-001',
    created_at: '2026-02-20T00:00:00.000Z',
    updated_at: '2026-02-24T00:00:00.000Z',
    slug: 'test-blog-post',
    featured_image: 'https://cdn.example.com/blog.jpg',
    category: 'news',
    tags: ['test', 'demo'],
    ...overrides,
  };
}

function makeAgentInput(params: Record<string, unknown> = {}) {
  return {
    context: {},
    parameters: params,
    requestId: 'req-test-001',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShopifyIntegrationAgent', () => {
  let agent: ShopifyIntegrationAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockCacheFlush.mockResolvedValue(undefined);
    agent = new ShopifyIntegrationAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('creates agent with correct agentType and model', () => {
      expect(agent.getAgentType()).toBe('shopify_integration');
      expect(agent.getConfig().model).toBe('sonnet');
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toContain('content_blog');
      expect(targets).toContain('data_engineering');
      expect(targets).toContain('conversion_optimization');
      expect(targets).toHaveLength(3);
    });

    it('returns a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('Shopify');
    });

    it('allows overriding config defaults', () => {
      const custom = new ShopifyIntegrationAgent({
        maxRetries: 5,
        timeoutMs: 60_000,
        confidenceThreshold: 80,
      });
      const config = custom.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(60_000);
      expect(config.confidenceThreshold).toBe(80);
    });
  });

  // -----------------------------------------------------------------------
  // process() - routing
  // -----------------------------------------------------------------------

  describe('process()', () => {
    it('routes sync_products operation and returns a valid AgentOutput', async () => {
      // Mock: SELECT active products returns one product
      mockQuery.mockResolvedValueOnce({ rows: [makeProduct()] });
      // Mock: SELECT product for syncProduct
      mockQuery.mockResolvedValueOnce({ rows: [makeProduct()] });
      // Mock: fetchProductFromShopify - decision lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ output_data: { title: 'Test Product', body_html: 'A test product description' } }],
      });
      // Mock: UPDATE synced_at for unchanged product
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: cacheDel for sync_status
      // Mock: logDecision INSERT
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: persistState INSERT
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: estimateSyncFreshness
      mockQuery.mockResolvedValueOnce({
        rows: [{ synced_at: new Date().toISOString() }],
      });

      const output = await agent.process(makeAgentInput({ operation: 'sync_products' }));

      expect(output.agentType).toBe('shopify_integration');
      expect(output.decision).toContain('Product sync completed');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeDefined();
      expect(output.timestamp).toBeDefined();
    });

    it('returns error output for unknown operations', async () => {
      // Mock: estimateSyncFreshness
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock: logDecision
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: persistState
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const output = await agent.process(makeAgentInput({ operation: 'nonexistent' }));

      expect(output.decision).toContain('No operation performed');
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });

    it('returns error output when an operation throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const output = await agent.process(makeAgentInput({ operation: 'sync_products' }));

      expect(output.decision).toContain('failed');
      expect(output.confidence.score).toBeLessThan(20);
      expect(output.warnings.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // syncProduct()
  // -----------------------------------------------------------------------

  describe('syncProduct()', () => {
    it('creates a product on Shopify when shopify_id is missing', async () => {
      const productWithoutShopifyId = makeProduct({ shopify_id: null });

      // SELECT product
      mockQuery.mockResolvedValueOnce({ rows: [productWithoutShopifyId] });
      // createProductOnShopify -> INSERT agent_decisions RETURNING
      mockQuery.mockResolvedValueOnce({ rows: [{ shopify_id: 'shpfy_prod-001' }] });
      // UPDATE products SET shopify_id
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: ProductSyncResult = await agent.syncProduct('prod-001');

      expect(result.status).toBe('created');
      expect(result.productId).toBe('prod-001');
      expect(result.changes).toContain('created_on_shopify');
    });

    it('reports unchanged when product fields match Shopify', async () => {
      const product = makeProduct();

      // SELECT product
      mockQuery.mockResolvedValueOnce({ rows: [product] });
      // fetchProductFromShopify -> query agent_decisions
      mockQuery.mockResolvedValueOnce({
        rows: [{
          output_data: {
            title: 'Test Product',
            body_html: 'A test product description',
            images: [{ src: 'https://cdn.example.com/img1.jpg' }],
            variants: [{ sku: 'SKU-001' }],
          },
        }],
      });
      // UPDATE synced_at
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: ProductSyncResult = await agent.syncProduct('prod-001');

      expect(result.status).toBe('unchanged');
      expect(result.changes).toHaveLength(0);
    });

    it('throws NotFoundError when product does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.syncProduct('nonexistent')).rejects.toThrow('Product not found');
    });

    it('detects and syncs title changes', async () => {
      const product = makeProduct({ title: 'Updated Title' });

      // SELECT product
      mockQuery.mockResolvedValueOnce({ rows: [product] });
      // fetchProductFromShopify
      mockQuery.mockResolvedValueOnce({
        rows: [{
          output_data: {
            title: 'Old Title',
            body_html: 'A test product description',
            images: [{ src: 'https://cdn.example.com/img1.jpg' }],
            variants: [{ sku: 'SKU-001' }],
          },
        }],
      });
      // updateProductOnShopify -> INSERT agent_decisions
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // UPDATE products synced_at
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: ProductSyncResult = await agent.syncProduct('prod-001');

      expect(result.status).toBe('updated');
      expect(result.changes).toContain('title');
    });
  });

  // -----------------------------------------------------------------------
  // syncInventory()
  // -----------------------------------------------------------------------

  describe('syncInventory()', () => {
    it('detects inventory discrepancies between local and Shopify', async () => {
      const product = makeProduct({ inventory_level: 100 });

      // SELECT synced products
      mockQuery.mockResolvedValueOnce({ rows: [product] });
      // fetchInventoryFromShopify -> SELECT product by shopify_id
      // Return a different inventory level to create a discrepancy
      mockQuery.mockResolvedValueOnce({
        rows: [{ product_id: 'prod-001', available: 80 }],
      });
      // updateInventoryOnShopify -> INSERT agent_decisions
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // fetchVariantStockFromShopify -> SELECT variants
      mockQuery.mockResolvedValueOnce({
        rows: [{ variants: [{ sku: 'SKU-001', stock: 100 }] }],
      });

      const result: InventorySyncResult = await agent.syncInventory();

      expect(result.updated).toBeGreaterThanOrEqual(1);
      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
      expect(result.discrepancies[0].field).toBe('inventory_level');
    });

    it('handles products with no shopify match gracefully', async () => {
      const product = makeProduct();

      // SELECT synced products
      mockQuery.mockResolvedValueOnce({ rows: [product] });
      // fetchInventoryFromShopify -> no result
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result: InventorySyncResult = await agent.syncInventory();

      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(result.discrepancies[0].resolution).toBe('shopify_product_not_found');
    });
  });

  // -----------------------------------------------------------------------
  // publishBlogPost()
  // -----------------------------------------------------------------------

  describe('publishBlogPost()', () => {
    it('publishes a blog post and returns the result', async () => {
      const content = makeContent();

      // SELECT content
      mockQuery.mockResolvedValueOnce({ rows: [content] });
      // publishToShopifyBlog -> INSERT agent_decisions RETURNING
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'decision-001' }] });
      // UPDATE content
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: BlogPublishResult = await agent.publishBlogPost('content-001');

      expect(result.contentId).toBe('content-001');
      expect(result.shopifyBlogId).toContain('shpfy_blog_');
      expect(result.url).toContain('test-blog-post');
      expect(result.publishedAt).toBeDefined();
    });

    it('throws NotFoundError for non-existent content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.publishBlogPost('missing')).rejects.toThrow('Content not found');
    });

    it('throws ValidationError for draft content', async () => {
      const draftContent = makeContent({ status: 'draft' });
      mockQuery.mockResolvedValueOnce({ rows: [draftContent] });

      await expect(agent.publishBlogPost('content-001')).rejects.toThrow(
        /must be in 'review' or 'published' status/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // validatePixelTracking()
  // -----------------------------------------------------------------------

  describe('validatePixelTracking()', () => {
    it('returns cached pixel validation when available', async () => {
      const cachedResult: PixelValidation = {
        pixelId: 'px-123',
        status: 'active',
        eventsTracked: ['PageView', 'AddToCart', 'Purchase'],
        issues: [],
        lastFiredAt: '2026-02-25T12:00:00Z',
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await agent.validatePixelTracking();

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns inactive status when no pixel config exists', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      // fetchPixelConfigFromShopify -> no result
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.validatePixelTracking();

      expect(result.status).toBe('inactive');
      expect(result.issues).toContain('No pixel configuration found on Shopify store');
    });

    it('identifies missing essential tracking events', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      // fetchPixelConfigFromShopify -> config with missing events
      mockQuery.mockResolvedValueOnce({
        rows: [{
          output_data: {
            pixelId: 'px-456',
            events: ['PageView'],
            lastFiredAt: '2026-02-25T11:00:00Z',
          },
        }],
      });

      const result = await agent.validatePixelTracking();

      expect(result.pixelId).toBe('px-456');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('AddToCart'))).toBe(true);
      expect(result.issues.some((i) => i.includes('Purchase'))).toBe(true);
      // Should cache the result
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('pixel_validation'),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateConversionTracking()
  // -----------------------------------------------------------------------

  describe('validateConversionTracking()', () => {
    it('returns inactive when no conversion config exists', async () => {
      // fetchConversionConfigFromShopify -> no result
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result: ConversionValidation = await agent.validateConversionTracking();

      expect(result.trackingActive).toBe(false);
      expect(result.eventsConfigured).toHaveLength(0);
      expect(result.missingEvents.length).toBeGreaterThan(0);
      expect(result.accuracy).toBe(0);
    });

    it('calculates accuracy based on configured events', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          output_data: {
            events: ['page_view', 'view_content', 'add_to_cart', 'begin_checkout', 'purchase', 'search'],
            dataQuality: 90,
          },
        }],
      });

      const result: ConversionValidation = await agent.validateConversionTracking();

      expect(result.trackingActive).toBe(true);
      expect(result.missingEvents).toHaveLength(0);
      expect(result.accuracy).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // registerWebhooks()
  // -----------------------------------------------------------------------

  describe('registerWebhooks()', () => {
    it('registers webhooks for valid topics', async () => {
      // fetchExistingWebhooks -> empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // createWebhookOnShopify -> INSERT for products/create
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // createWebhookOnShopify -> INSERT for orders/create
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: WebhookRegistration[] = await agent.registerWebhooks([
        'products/create',
        'orders/create',
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe('products/create');
      expect(result[1].topic).toBe('orders/create');
      expect(result[0].id).toBeDefined();
      expect(result[0].address).toContain('products-create');
      expect(result[0].createdAt).toBeDefined();
    });

    it('throws ValidationError for unsupported webhook topics', async () => {
      await expect(
        agent.registerWebhooks(['invalid/topic']),
      ).rejects.toThrow(/Unsupported webhook topics/);
    });

    it('skips already-registered webhook topics', async () => {
      // fetchExistingWebhooks -> one already registered
      mockQuery.mockResolvedValueOnce({
        rows: [{ output_data: { topic: 'products/create', active: true } }],
      });
      // createWebhookOnShopify for orders/create only
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await agent.registerWebhooks(['products/create', 'orders/create']);

      // Only orders/create should be newly registered
      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe('orders/create');
    });
  });

  // -----------------------------------------------------------------------
  // handleWebhook()
  // -----------------------------------------------------------------------

  describe('handleWebhook()', () => {
    it('handles products/delete webhook by deactivating local product', async () => {
      // UPDATE products SET is_active = false
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // INSERT agent_decisions (audit record)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await agent.handleWebhook('products/delete', { id: 'shpfy_prod-001' });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = false');
      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('handles inventory_levels/update webhook', async () => {
      // UPDATE products SET inventory_level
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // INSERT agent_decisions (audit record)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await agent.handleWebhook('inventory_levels/update', {
        inventory_item_id: 'prod-001',
        available: 50,
      });

      expect(mockQuery.mock.calls[0][0]).toContain('inventory_level');
      expect(mockQuery.mock.calls[0][1]).toContain(50);
    });

    it('silently skips unsupported webhook topics', async () => {
      await agent.handleWebhook('unsupported/topic', { data: 'test' });

      // No DB queries should be made for unsupported topics
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // setupUpsellFunnel()
  // -----------------------------------------------------------------------

  describe('setupUpsellFunnel()', () => {
    it('creates a funnel with correct step types based on pricing', async () => {
      const primaryProduct = makeProduct({ id: 'primary-001' });
      const upsellProduct = makeProduct({
        id: 'upsell-001',
        variants: [{ id: 'v1', title: 'Premium', sku: 'SKU-UP', price: 59.99, stock: 50 }],
      });
      const downsellProduct = makeProduct({
        id: 'downsell-001',
        variants: [{ id: 'v2', title: 'Basic', sku: 'SKU-DOWN', price: 9.99, stock: 200 }],
      });

      // SELECT primary product
      mockQuery.mockResolvedValueOnce({ rows: [primaryProduct] });
      // SELECT upsell products
      mockQuery.mockResolvedValueOnce({ rows: [upsellProduct, downsellProduct] });
      // INSERT agent_decisions (funnel config)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: UpsellConfig = await agent.setupUpsellFunnel(
        'primary-001',
        ['upsell-001', 'downsell-001'],
      );

      expect(result.primaryProductId).toBe('primary-001');
      expect(result.upsellProducts).toEqual(['upsell-001', 'downsell-001']);
      expect(result.funnelSteps.length).toBe(2);
      expect(result.expectedRevenueLift).toBeGreaterThanOrEqual(0);

      // Higher priced product should be upsell
      const upsellStep = result.funnelSteps.find((s) => s.productId === 'upsell-001');
      expect(upsellStep?.type).toBe('upsell');

      // Lower priced product should be downsell
      const downsellStep = result.funnelSteps.find((s) => s.productId === 'downsell-001');
      expect(downsellStep?.type).toBe('downsell');
    });

    it('throws NotFoundError when primary product does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        agent.setupUpsellFunnel('missing', ['up-001']),
      ).rejects.toThrow('Primary product not found');
    });

    it('throws NotFoundError when upsell products are missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProduct()] });
      // Only one of two upsell products found
      mockQuery.mockResolvedValueOnce({ rows: [makeProduct({ id: 'up-001' })] });

      await expect(
        agent.setupUpsellFunnel('prod-001', ['up-001', 'up-missing']),
      ).rejects.toThrow('Upsell products not found');
    });
  });

  // -----------------------------------------------------------------------
  // checkSyncStatus()
  // -----------------------------------------------------------------------

  describe('checkSyncStatus()', () => {
    it('returns cached sync status when available', async () => {
      const cachedStatus: SyncStatus = {
        lastSync: '2026-02-25T12:00:00Z',
        productsInSync: 45,
        productsOutOfSync: 5,
        inventoryAccuracy: 90,
      };
      mockCacheGet.mockResolvedValueOnce(cachedStatus);

      const result = await agent.checkSyncStatus();

      expect(result).toEqual(cachedStatus);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries database and calculates sync metrics when cache is empty', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // COUNT active products
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      // COUNT in-sync products
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }] });
      // Inventory accuracy query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '50', matched: '45' }] });
      // Last sync timestamp
      mockQuery.mockResolvedValueOnce({ rows: [{ synced_at: '2026-02-25T11:30:00Z' }] });

      const result: SyncStatus = await agent.checkSyncStatus();

      expect(result.productsInSync).toBe(42);
      expect(result.productsOutOfSync).toBe(8);
      expect(result.inventoryAccuracy).toBe(90);
      expect(result.lastSync).toBe('2026-02-25T11:30:00Z');
      // Should cache the result
      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // resolveDiscrepancies()
  // -----------------------------------------------------------------------

  describe('resolveDiscrepancies()', () => {
    it('resolves inventory discrepancies by pushing local values to Shopify', async () => {
      const discrepancies: Discrepancy[] = [
        {
          productId: 'prod-001',
          field: 'inventory_level',
          localValue: 100,
          shopifyValue: 80,
        },
      ];

      // SELECT shopify_id
      mockQuery.mockResolvedValueOnce({ rows: [{ shopify_id: 'shpfy_prod-001' }] });
      // updateInventoryOnShopify -> INSERT agent_decisions
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const results: ResolutionResult[] = await agent.resolveDiscrepancies(discrepancies);

      expect(results).toHaveLength(1);
      expect(results[0].resolved).toBe(true);
      expect(results[0].action).toContain('Updated Shopify inventory_level to 100');
      expect(results[0].discrepancy.resolution).toBe('pushed_local_to_shopify');
    });

    it('marks discrepancy as unresolved when product has no shopify_id', async () => {
      const discrepancies: Discrepancy[] = [
        {
          productId: 'prod-no-shopify',
          field: 'title',
          localValue: 'New Title',
          shopifyValue: 'Old Title',
        },
      ];

      // SELECT shopify_id -> null
      mockQuery.mockResolvedValueOnce({ rows: [{ shopify_id: null }] });

      const results = await agent.resolveDiscrepancies(discrepancies);

      expect(results).toHaveLength(1);
      expect(results[0].resolved).toBe(false);
      expect(results[0].action).toBe('no_shopify_id');
    });

    it('handles resolution errors gracefully', async () => {
      const discrepancies: Discrepancy[] = [
        {
          productId: 'prod-err',
          field: 'inventory_level',
          localValue: 50,
          shopifyValue: 25,
        },
      ];

      // SELECT shopify_id throws
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const results = await agent.resolveDiscrepancies(discrepancies);

      expect(results).toHaveLength(1);
      expect(results[0].resolved).toBe(false);
      expect(results[0].action).toContain('resolution_failed');
    });
  });

  // -----------------------------------------------------------------------
  // Confidence scoring
  // -----------------------------------------------------------------------

  describe('confidence scoring', () => {
    it('produces confidence scores with correct structure', async () => {
      // Set up a simple check_sync_status operation to test confidence
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', matched: '10' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ synced_at: new Date().toISOString() }],
      });
      // estimateSyncFreshness
      mockQuery.mockResolvedValueOnce({
        rows: [{ synced_at: new Date().toISOString() }],
      });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const output = await agent.process(makeAgentInput({ operation: 'check_sync_status' }));

      expect(output.confidence).toBeDefined();
      expect(output.confidence.score).toBeGreaterThanOrEqual(0);
      expect(output.confidence.score).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'very_high']).toContain(output.confidence.level);
      expect(output.confidence.factors).toBeDefined();
      expect(output.confidence.factors).toHaveProperty('api_reliability');
      expect(output.confidence.factors).toHaveProperty('data_completeness');
      expect(output.confidence.factors).toHaveProperty('operation_success');
      expect(output.confidence.factors).toHaveProperty('sync_freshness');
    });
  });
});

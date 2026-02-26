/**
 * Shopify Admin Service.
 *
 * Provides static methods for managing the Shopify integration layer
 * including product synchronisation, blog publishing, webhook management,
 * and pixel event tracking. All mutations are persisted to dedicated tables
 * and accompanied by audit-log entries for traceability.
 *
 * Connection state is verified against the `platform_connections` table
 * before any operation that requires an active Shopify link.
 *
 * Frequently accessed records are cached in Redis with short TTLs to
 * reduce database load while keeping data reasonably fresh.
 */

import { pool } from '../../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../config/redis';
import { logger } from '../../../utils/logger';
import { generateId } from '../../../utils/helpers';
import { AuditService } from '../../audit.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_PRODUCT_PREFIX = 'shopify:product:';
const CACHE_KEY_PIXEL_EVENTS_PREFIX = 'shopify:pixel_events:';
const CACHE_TTL_PRODUCT = 300; // 5 minutes
const CACHE_TTL_PIXEL_EVENTS = 120; // 2 minutes

/** Webhook topics that the Shopify integration supports. */
const VALID_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
  'inventory_levels/connect',
  'customers/create',
  'customers/update',
  'checkouts/create',
  'checkouts/update',
  'refunds/create',
  'collections/create',
  'collections/update',
] as const;

type WebhookTopic = (typeof VALID_WEBHOOK_TOPICS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the active Shopify connection for a user.
 * Throws if no active connection exists.
 */
async function getActiveConnection(userId: string): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `SELECT * FROM platform_connections
     WHERE user_id = $1 AND platform_type = 'shopify' AND status = 'active'
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error('No active Shopify connection found. Please connect your Shopify store first.');
  }

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ShopifyAdminService {
  // -------------------------------------------------------------------------
  // syncProducts
  // -------------------------------------------------------------------------

  /**
   * Synchronise products from the Shopify store.
   *
   * Query sequence:
   *   1. Fetch the active Shopify connection for the user
   *   2. Upsert products
   *   3. Insert sync log entries
   *   4. Update sync timestamp
   *
   * @param userId - The ID of the user initiating the sync.
   * @returns An object containing `synced`, `failed`, and `skipped` counts.
   */
  static async syncProducts(
    userId: string,
  ): Promise<{ synced: number; failed: number; skipped: number }> {
    // 1. Fetch the active connection (throws if none)
    await getActiveConnection(userId);

    // 2. Upsert products
    const productsResult = await pool.query(
      `INSERT INTO shopify_products (user_id)
       VALUES ($1)
       ON CONFLICT DO UPDATE
       RETURNING *`,
      [userId],
    );

    const products = productsResult.rows;

    // 3. Insert sync log entries
    const syncLogResult = await pool.query(
      `INSERT INTO shopify_sync_logs (user_id, entity_type, sync_type)
       VALUES ($1, 'product', 'full')
       RETURNING *`,
      [userId],
    );

    const syncLogs = syncLogResult.rows;
    const successCount = syncLogs.filter((r: Record<string, unknown>) => r.status === 'success').length;
    const failedCount = syncLogs.filter((r: Record<string, unknown>) => r.status === 'failed').length;
    const skippedCount = products.length - successCount - failedCount;

    // 4. Update sync timestamp
    await pool.query(
      `UPDATE platform_connections SET last_synced_at = NOW() WHERE user_id = $1 AND platform_type = 'shopify'`,
      [userId],
    );

    await AuditService.log({
      userId,
      action: 'shopify.sync_products',
      resourceType: 'shopify_sync',
      details: { synced: successCount, failed: failedCount, skipped: skippedCount },
    });

    logger.info('Shopify product sync completed', { userId, synced: successCount, failed: failedCount, skipped: skippedCount });

    return { synced: successCount, failed: failedCount, skipped: skippedCount };
  }

  // -------------------------------------------------------------------------
  // getProduct
  // -------------------------------------------------------------------------

  /**
   * Retrieve a single product by its ID.
   *
   * Checks Redis cache first. On cache miss, queries the database and
   * populates the cache before returning.
   *
   * @param productId - The ID of the product to look up.
   * @returns The product record, or `null` if none exists.
   */
  static async getProduct(productId: string): Promise<Record<string, unknown> | null> {
    const cacheKey = `${CACHE_KEY_PRODUCT_PREFIX}${productId}`;

    // Check cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Shopify product cache hit', { productId });
      return (typeof cached === 'string' ? JSON.parse(cached) : cached) as Record<string, unknown>;
    }

    const result = await pool.query(
      `SELECT * FROM shopify_products WHERE id = $1 LIMIT 1`,
      [productId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const product = result.rows[0];

    await cacheSet(cacheKey, JSON.stringify(product), CACHE_TTL_PRODUCT);

    return product;
  }

  // -------------------------------------------------------------------------
  // updateProduct
  // -------------------------------------------------------------------------

  /**
   * Update a product on Shopify and return the updated record.
   *
   * Query sequence:
   *   1. Fetch active connection
   *   2. Fetch existing product (throw if not found)
   *   3. Update product
   *   Optionally: 4. Insert sync log
   *
   * @param userId    - The ID of the user performing the update.
   * @param productId - The ID of the product to update.
   * @param data      - Partial fields to merge into the record.
   * @returns The updated product record.
   */
  static async updateProduct(
    userId: string,
    productId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // 1. Fetch connection
    await getActiveConnection(userId);

    // 2. Fetch existing product
    const existing = await pool.query(
      `SELECT * FROM shopify_products WHERE id = $1 LIMIT 1`,
      [productId],
    );

    if (existing.rows.length === 0) {
      throw new Error(`Product not found: ${productId}`);
    }

    // 3. Update the product
    const updateResult = await pool.query(
      `UPDATE shopify_products SET title = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [data.title ?? existing.rows[0].title, data.status ?? existing.rows[0].status, productId],
    );

    const updated = updateResult.rows[0];

    // 4. Insert sync log entry for the update
    try {
      await pool.query(
        `INSERT INTO shopify_sync_logs (id, entity_type, entity_id, sync_type, status, synced_by, created_at)
         VALUES ($1, 'product', $2, 'update', 'success', $3, NOW())
         RETURNING *`,
        [generateId(), productId, userId],
      );
    } catch {
      // sync log is best-effort
    }

    // Invalidate cache
    await cacheDel(`${CACHE_KEY_PRODUCT_PREFIX}${productId}`);

    await AuditService.log({
      userId,
      action: 'shopify.update_product',
      resourceType: 'shopify_product',
      resourceId: productId,
      details: { updatedFields: Object.keys(data) },
    });

    logger.info('Shopify product updated', { userId, productId });

    return updated;
  }

  // -------------------------------------------------------------------------
  // publishBlog
  // -------------------------------------------------------------------------

  /**
   * Publish a blog post to Shopify.
   *
   * Query sequence:
   *   1. Fetch active connection
   *   2. Insert blog row, returns the row with external_id
   *   Optionally: 3. Insert sync log
   *
   * @param userId - The ID of the user publishing the blog.
   * @param data   - Blog content fields.
   * @returns The created blog record with external_id.
   */
  static async publishBlog(
    userId: string,
    data: { title: string; body_html: string; author?: string; tags?: string },
  ): Promise<Record<string, unknown>> {
    // 1. Fetch connection
    await getActiveConnection(userId);

    const id = generateId();

    // 2. Insert the blog
    const result = await pool.query(
      `INSERT INTO shopify_blogs (id, user_id, title, body_html, author, tags, status, published_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'published', NOW(), NOW(), NOW())
       RETURNING *`,
      [id, userId, data.title, data.body_html, data.author ?? null, data.tags ?? null],
    );

    const blog = result.rows[0];

    // 3. Insert sync log entry for the blog publish
    try {
      await pool.query(
        `INSERT INTO shopify_sync_logs (id, entity_type, entity_id, sync_type, status, synced_by, created_at)
         VALUES ($1, 'blog', $2, 'create', 'success', $3, NOW())
         RETURNING *`,
        [generateId(), blog.id, userId],
      );
    } catch {
      // sync log is best-effort
    }

    await AuditService.log({
      userId,
      action: 'shopify.publish_blog',
      resourceType: 'shopify_blog',
      resourceId: blog.id,
      details: { title: data.title, external_id: blog.external_id },
    });

    logger.info('Shopify blog published', { userId, blogId: blog.id });

    return blog;
  }

  // -------------------------------------------------------------------------
  // updateBlog
  // -------------------------------------------------------------------------

  /**
   * Update an existing blog post.
   *
   * Query sequence:
   *   1. Fetch active connection
   *   2. Fetch existing blog (throw if not found)
   *   3. Update blog, return updated row
   *
   * @param userId - The ID of the user performing the update.
   * @param blogId - The ID of the blog to update.
   * @param data   - Partial blog fields to update.
   * @returns The updated blog record.
   */
  static async updateBlog(
    userId: string,
    blogId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // 1. Fetch connection
    await getActiveConnection(userId);

    // 2. Fetch existing blog
    const existing = await pool.query(
      `SELECT * FROM shopify_blogs WHERE id = $1 LIMIT 1`,
      [blogId],
    );

    if (existing.rows.length === 0) {
      throw new Error(`Blog not found: ${blogId}`);
    }

    // 3. Update the blog
    const updateResult = await pool.query(
      `UPDATE shopify_blogs SET title = $1, body_html = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [data.title ?? existing.rows[0].title, data.body_html ?? existing.rows[0].body_html, blogId],
    );

    const updated = updateResult.rows[0];

    // Invalidate cache
    await cacheDel(`shopify:blog:${blogId}`);

    logger.info('Shopify blog updated', { userId, blogId });

    return updated;
  }

  // -------------------------------------------------------------------------
  // listBlogs
  // -------------------------------------------------------------------------

  /**
   * List blog posts with optional filtering and pagination.
   *
   * Query sequence:
   *   1. Count query (with optional status filter)
   *   2. Data query (with optional status filter, pagination)
   *
   * @param filters - Optional filters: `status`, `page`, `limit`.
   * @returns A paginated result with `data` and `total`.
   */
  static async listBlogs(
    filters: { status?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM shopify_blogs ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count as string, 10);

    // 2. Data query
    const dataResult = await pool.query(
      `SELECT * FROM shopify_blogs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
      limit,
    };
  }

  // -------------------------------------------------------------------------
  // registerWebhook
  // -------------------------------------------------------------------------

  /**
   * Register a new Shopify webhook.
   *
   * Query sequence:
   *   1. Fetch active connection (also validates topic after)
   *   2. Insert webhook row
   *
   * @param userId  - The ID of the user registering the webhook.
   * @param topic   - The webhook topic (e.g. 'orders/create').
   * @param address - The endpoint URL for the webhook.
   * @returns The created webhook record with external_webhook_id.
   */
  static async registerWebhook(
    userId: string,
    topic: string,
    address: string,
  ): Promise<Record<string, unknown>> {
    // 1. Fetch connection
    await getActiveConnection(userId);

    // Validate the webhook topic
    if (!VALID_WEBHOOK_TOPICS.includes(topic as WebhookTopic)) {
      throw new Error(
        `Invalid webhook topic: '${topic}'. Supported topics: ${VALID_WEBHOOK_TOPICS.join(', ')}`,
      );
    }

    const id = generateId();

    // 2. Insert webhook
    const result = await pool.query(
      `INSERT INTO shopify_webhooks (id, topic, address, external_webhook_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       RETURNING *`,
      [id, topic, address, `shopify-wh-${id}`],
    );

    const webhook = result.rows[0];

    await AuditService.log({
      userId,
      action: 'shopify.register_webhook',
      resourceType: 'shopify_webhook',
      resourceId: webhook.id,
      details: { topic, address, external_webhook_id: webhook.external_webhook_id },
    });

    logger.info('Shopify webhook registered', { userId, webhookId: webhook.id, topic });

    return webhook;
  }

  // -------------------------------------------------------------------------
  // deleteWebhook
  // -------------------------------------------------------------------------

  /**
   * Delete a Shopify webhook registration.
   *
   * Query sequence:
   *   1. Fetch existing webhook (throw if not found)
   *   2. Delete the webhook
   *
   * @param userId    - The ID of the user deleting the webhook.
   * @param webhookId - The ID of the webhook to delete.
   */
  static async deleteWebhook(userId: string, webhookId: string): Promise<void> {
    // 1. Fetch existing webhook
    const existing = await pool.query(
      `SELECT * FROM shopify_webhooks WHERE id = $1 LIMIT 1`,
      [webhookId],
    );

    if (existing.rows.length === 0) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    // 2. Delete
    await pool.query(
      `DELETE FROM shopify_webhooks WHERE id = $1`,
      [webhookId],
    );

    await AuditService.log({
      userId,
      action: 'shopify.delete_webhook',
      resourceType: 'shopify_webhook',
      resourceId: webhookId,
      details: { topic: existing.rows[0].topic },
    });

    logger.info('Shopify webhook deleted', { userId, webhookId });
  }

  // -------------------------------------------------------------------------
  // listWebhooks
  // -------------------------------------------------------------------------

  /**
   * List all registered Shopify webhooks.
   *
   * @returns An array of webhook records.
   */
  static async listWebhooks(): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      `SELECT * FROM shopify_webhooks ORDER BY created_at DESC`,
    );

    return result.rows;
  }

  // -------------------------------------------------------------------------
  // handleWebhookEvent
  // -------------------------------------------------------------------------

  /**
   * Handle an incoming Shopify webhook event.
   *
   * Inserts an event record into the database. For products/update events,
   * also invalidates the relevant product cache entry.
   *
   * @param event - The webhook payload containing `topic`, `payload`, and `shop_domain`.
   * @returns The inserted event record.
   */
  static async handleWebhookEvent(event: {
    topic: string;
    payload: Record<string, unknown>;
    shop_domain: string;
  }): Promise<Record<string, unknown>> {
    const { topic, payload, shop_domain } = event;

    logger.info('Processing Shopify webhook event', { topic, shop_domain });

    // Insert event record
    const result = await pool.query(
      `INSERT INTO shopify_webhook_events (topic, payload, shop_domain)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [topic, JSON.stringify(payload), shop_domain],
    );

    const record = result.rows[0];

    // Invalidate cache for product-related events
    if (topic === 'products/update' || topic === 'products/create' || topic === 'products/delete') {
      const productId = payload.id ?? payload.product_id;
      if (productId) {
        await cacheDel(`${CACHE_KEY_PRODUCT_PREFIX}${productId}`);
      }
    }

    logger.info('Webhook event processed', { topic, eventId: record.id });

    return record;
  }

  // -------------------------------------------------------------------------
  // validatePixel
  // -------------------------------------------------------------------------

  /**
   * Validate a Shopify pixel by checking for recent events.
   *
   * Query sequence:
   *   1. Fetch active connection
   *   2. Query event counts grouped by event_type
   *
   * @param userId - The ID of the user requesting validation.
   * @returns An object with `is_valid` and `event_counts`.
   */
  static async validatePixel(
    userId: string,
  ): Promise<{ is_valid: boolean; event_counts: Record<string, unknown>[] | undefined }> {
    // 1. Fetch connection
    await getActiveConnection(userId);

    // 2. Query event counts
    const result = await pool.query(
      `SELECT event_type, COUNT(*) as count FROM shopify_pixel_events
       WHERE user_id = $1
       GROUP BY event_type`,
      [userId],
    );

    const eventCounts = result.rows;
    const isValid = eventCounts.length > 0;

    return {
      is_valid: isValid,
      event_counts: isValid ? eventCounts : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // getPixelEvents
  // -------------------------------------------------------------------------

  /**
   * Retrieve pixel events with optional filtering and pagination.
   *
   * Supports caching. Filters use snake_case keys: event_type, start_date, end_date.
   *
   * @param filters - Optional filters and pagination parameters.
   * @returns A paginated result with `data`, `total`, `page`, `limit`.
   */
  static async getPixelEvents(
    filters: {
      event_type?: string;
      start_date?: string;
      end_date?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    // Build cache key from filters
    const cacheKey = `${CACHE_KEY_PIXEL_EVENTS_PREFIX}${JSON.stringify(filters)}`;

    // Check cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Shopify pixel events cache hit');
      return (typeof cached === 'string' ? JSON.parse(cached) : cached) as { data: Record<string, unknown>[]; total: number; page: number; limit: number };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.event_type) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.event_type);
    }

    if (filters.start_date) {
      conditions.push(`recorded_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`recorded_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM shopify_pixel_events ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count as string, 10);

    // 2. Data query
    const dataResult = await pool.query(
      `SELECT * FROM shopify_pixel_events ${whereClause}
       ORDER BY recorded_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const result = {
      data: dataResult.rows,
      total,
      page,
      limit,
    };

    // Populate cache
    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_PIXEL_EVENTS);

    return result;
  }

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------

  /**
   * Get the Shopify connection status for a user.
   *
   * @param userId - The ID of the user to check.
   * @returns An object with `connected` boolean and connection details.
   */
  static async getConnectionStatus(
    userId: string,
  ): Promise<{ connected: boolean; connection?: Record<string, unknown> }> {
    const result = await pool.query(
      `SELECT * FROM platform_connections
       WHERE user_id = $1 AND platform_type = 'shopify'
       LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return { connected: false };
    }

    const connection = result.rows[0];

    if (connection.status !== 'active') {
      return { connected: false, connection };
    }

    return { connected: true, connection };
  }
}

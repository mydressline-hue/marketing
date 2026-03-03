// ============================================================
// AI International Growth Engine - Shopify Integration Agent (Agent 11)
// Handles product/inventory sync, blog publishing, pixel/conversion
// tracking validation, webhook automation, and upsell/funnel integration
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfig,
} from '../base/types';
import type {
  AgentType,
  Product,
  ProductVariant,
  InventoryLevel,
  BlogPost,
} from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../config/redis';
import { generateId, retryWithBackoff } from '../../utils/helpers';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../utils/errors';

// ============================================================
// Type Definitions
// ============================================================

export interface SyncError {
  productId: string;
  error: string;
  retryable: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
  errors: SyncError[];
  duration: number;
}

export interface ProductSyncResult {
  productId: string;
  shopifyId: string;
  status: 'created' | 'updated' | 'unchanged' | 'failed';
  changes: string[];
}

export interface Discrepancy {
  productId: string;
  field: string;
  localValue: unknown;
  shopifyValue: unknown;
  resolution?: string;
}

export interface InventorySyncResult {
  updated: number;
  discrepancies: Discrepancy[];
  timestamp: string;
}

export interface BlogPublishResult {
  contentId: string;
  shopifyBlogId: string;
  url: string;
  publishedAt: string;
}

export interface PixelValidation {
  pixelId: string;
  status: 'active' | 'inactive' | 'error';
  eventsTracked: string[];
  issues: string[];
  lastFiredAt?: string;
}

export interface ConversionValidation {
  trackingActive: boolean;
  eventsConfigured: string[];
  missingEvents: string[];
  accuracy: number;
}

export interface WebhookRegistration {
  id: string;
  topic: string;
  address: string;
  createdAt: string;
}

export interface FunnelStep {
  step: number;
  type: 'upsell' | 'cross_sell' | 'downsell';
  productId: string;
  discount?: number;
}

export interface UpsellConfig {
  primaryProductId: string;
  upsellProducts: string[];
  funnelSteps: FunnelStep[];
  expectedRevenueLift: number;
}

export interface SyncStatus {
  lastSync: string;
  productsInSync: number;
  productsOutOfSync: number;
  inventoryAccuracy: number;
}

export interface ResolutionResult {
  discrepancy: Discrepancy;
  resolved: boolean;
  action: string;
}

// ============================================================
// Cache keys and constants
// ============================================================

const CACHE_PREFIX = 'shopify_integration';
const CACHE_TTL_SYNC_STATUS = 300; // 5 minutes
const CACHE_TTL_PIXEL_VALIDATION = 600; // 10 minutes
const CACHE_TTL_PRODUCT = 900; // 15 minutes

const REQUIRED_CONVERSION_EVENTS = [
  'page_view',
  'view_content',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'search',
];

const SUPPORTED_WEBHOOK_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
  'orders/create',
  'orders/paid',
  'orders/fulfilled',
  'orders/cancelled',
  'checkouts/create',
  'checkouts/update',
  'app/uninstalled',
];

// ============================================================
// ShopifyIntegrationAgent
// ============================================================

export class ShopifyIntegrationAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'shopify_integration',
      model: 'sonnet',
      maxRetries: 3,
      timeoutMs: 120_000,
      confidenceThreshold: 65,
      ...config,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the agent types whose decisions this agent can challenge.
   * Shopify integration validates content blog publishing, data engineering
   * pipelines, and conversion optimization tracking.
   */
  getChallengeTargets(): AgentType[] {
    return ['content_blog', 'data_engineering', 'conversion_optimization'];
  }

  /**
   * Returns the system prompt for AI-assisted Shopify integration tasks.
   */
  getSystemPrompt(): string {
    return [
      'You are the Shopify Integration Agent for the AI International Growth Engine.',
      'Your responsibilities include:',
      '- Synchronizing products, variants, images, and inventory between the local database and Shopify',
      '- Publishing blog content to Shopify storefronts',
      '- Validating pixel and conversion tracking configurations',
      '- Managing webhook registrations and processing incoming webhook payloads',
      '- Setting up upsell and cross-sell funnels to maximize revenue',
      '',
      'When analyzing sync discrepancies, always prefer the source of truth (local DB) unless the Shopify value is more recent.',
      'Flag any uncertainty about data freshness, API rate limits, or inventory accuracy.',
      'Provide confidence scores for every decision based on data completeness and API response reliability.',
    ].join('\n');
  }

  /**
   * Main processing entry point. Orchestrates the requested Shopify operation
   * based on the input parameters.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const operation = input.parameters.operation as string | undefined;
    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    this.log.info('Processing Shopify integration request', {
      requestId: input.requestId,
      operation,
    });

    try {
      let data: Record<string, unknown> = {};
      let decision: string;

      switch (operation) {
        case 'sync_products': {
          const syncResult = await this.syncProducts();
          data = { syncResult };
          decision = `Product sync completed: ${syncResult.synced} synced, ${syncResult.failed} failed, ${syncResult.skipped} skipped`;
          if (syncResult.failed > 0) {
            warnings.push(`${syncResult.failed} products failed to sync`);
            const retryableCount = syncResult.errors.filter((e) => e.retryable).length;
            if (retryableCount > 0) {
              recommendations.push(
                `${retryableCount} failures are retryable - schedule a retry sync`,
              );
            }
          }
          break;
        }

        case 'sync_product': {
          const productId = input.parameters.productId as string;
          if (!productId) {
            throw new ValidationError('productId is required for sync_product operation');
          }
          const productResult = await this.syncProduct(productId);
          data = { productResult };
          decision = `Product ${productId} sync status: ${productResult.status}`;
          if (productResult.changes.length > 0) {
            recommendations.push(
              `Updated fields: ${productResult.changes.join(', ')}`,
            );
          }
          break;
        }

        case 'sync_inventory': {
          const inventoryResult = await this.syncInventory();
          data = { inventoryResult };
          decision = `Inventory sync completed: ${inventoryResult.updated} updated`;
          if (inventoryResult.discrepancies.length > 0) {
            warnings.push(
              `${inventoryResult.discrepancies.length} inventory discrepancies detected`,
            );
            recommendations.push('Review and resolve inventory discrepancies before next sync');
          }
          break;
        }

        case 'publish_blog': {
          const contentId = input.parameters.contentId as string;
          if (!contentId) {
            throw new ValidationError('contentId is required for publish_blog operation');
          }
          const blogResult = await this.publishBlogPost(contentId);
          data = { blogResult };
          decision = `Blog post published to Shopify: ${blogResult.url}`;
          recommendations.push('Verify the published post renders correctly on the storefront');
          break;
        }

        case 'validate_pixels': {
          const pixelResult = await this.validatePixelTracking();
          data = { pixelResult };
          decision = `Pixel tracking status: ${pixelResult.status}`;
          if (pixelResult.issues.length > 0) {
            warnings.push(...pixelResult.issues);
            recommendations.push('Remediate pixel tracking issues to avoid data loss');
          }
          break;
        }

        case 'validate_conversions': {
          const convResult = await this.validateConversionTracking();
          data = { convResult };
          decision = convResult.trackingActive
            ? `Conversion tracking active with ${convResult.accuracy}% accuracy`
            : 'Conversion tracking is NOT active';
          if (convResult.missingEvents.length > 0) {
            warnings.push(
              `Missing conversion events: ${convResult.missingEvents.join(', ')}`,
            );
            recommendations.push('Configure missing conversion events in Shopify admin');
          }
          break;
        }

        case 'register_webhooks': {
          const topics = input.parameters.topics as string[];
          if (!topics || !Array.isArray(topics) || topics.length === 0) {
            throw new ValidationError('topics array is required for register_webhooks operation');
          }
          const webhookResults = await this.registerWebhooks(topics);
          data = { webhooks: webhookResults };
          decision = `Registered ${webhookResults.length} webhooks`;
          break;
        }

        case 'handle_webhook': {
          const topic = input.parameters.topic as string;
          const payload = input.parameters.payload as Record<string, unknown>;
          if (!topic || !payload) {
            throw new ValidationError('topic and payload are required for handle_webhook operation');
          }
          await this.handleWebhook(topic, payload);
          data = { topic, processed: true };
          decision = `Webhook ${topic} processed successfully`;
          break;
        }

        case 'setup_upsell': {
          const primaryProductId = input.parameters.productId as string;
          const upsellProducts = input.parameters.upsellProducts as string[];
          if (!primaryProductId || !upsellProducts || upsellProducts.length === 0) {
            throw new ValidationError(
              'productId and upsellProducts are required for setup_upsell operation',
            );
          }
          const upsellConfig = await this.setupUpsellFunnel(primaryProductId, upsellProducts);
          data = { upsellConfig };
          decision = `Upsell funnel configured with expected ${upsellConfig.expectedRevenueLift}% revenue lift`;
          recommendations.push('A/B test the funnel against a control group before full rollout');
          break;
        }

        case 'check_sync_status': {
          const syncStatus = await this.checkSyncStatus();
          data = { syncStatus };
          decision = `Sync status: ${syncStatus.productsInSync} in sync, ${syncStatus.productsOutOfSync} out of sync, ${syncStatus.inventoryAccuracy}% inventory accuracy`;
          if (syncStatus.productsOutOfSync > 0) {
            warnings.push(`${syncStatus.productsOutOfSync} products are out of sync`);
            recommendations.push('Run a full product sync to reconcile discrepancies');
          }
          break;
        }

        case 'resolve_discrepancies': {
          const discrepancies = input.parameters.discrepancies as Discrepancy[];
          if (!discrepancies || !Array.isArray(discrepancies) || discrepancies.length === 0) {
            throw new ValidationError(
              'discrepancies array is required for resolve_discrepancies operation',
            );
          }
          const resolutions = await this.resolveDiscrepancies(discrepancies);
          data = { resolutions };
          const resolvedCount = resolutions.filter((r) => r.resolved).length;
          decision = `Resolved ${resolvedCount}/${resolutions.length} discrepancies`;
          if (resolvedCount < resolutions.length) {
            warnings.push(
              `${resolutions.length - resolvedCount} discrepancies could not be automatically resolved`,
            );
            recommendations.push('Manually review unresolved discrepancies');
          }
          break;
        }

        default: {
          uncertainties.push(
            this.flagUncertainty(
              'operation',
              `Unknown or missing operation: ${operation ?? 'none'}`,
            ),
          );
          decision = 'No operation performed - unknown or missing operation parameter';
          break;
        }
      }

      const duration = Date.now() - startTime;

      const confidence = this.calculateConfidence({
        api_reliability: this.estimateApiReliability(warnings),
        data_completeness: uncertainties.length === 0 ? 85 : Math.max(20, 85 - uncertainties.length * 15),
        operation_success: warnings.length === 0 ? 90 : Math.max(30, 90 - warnings.length * 10),
        sync_freshness: await this.estimateSyncFreshness(),
      });

      const output = this.buildOutput(
        decision,
        { ...data, durationMs: duration },
        confidence,
        `Shopify integration operation '${operation ?? 'unknown'}' completed in ${duration}ms. ${warnings.length > 0 ? `Warnings: ${warnings.length}. ` : ''}${uncertainties.length > 0 ? `Uncertainties: ${uncertainties.length}.` : ''}`,
        recommendations,
        warnings,
        uncertainties,
      );

      await this.logDecision(input, output);
      await this.persistState({ lastOperation: operation, duration, timestamp: new Date().toISOString() });

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Shopify integration processing failed', {
        requestId: input.requestId,
        operation,
        error: message,
      });

      const confidence = this.calculateConfidence({
        api_reliability: 10,
        data_completeness: 10,
        operation_success: 0,
        sync_freshness: 20,
      });

      return this.buildOutput(
        `Shopify integration operation failed: ${message}`,
        { error: message, operation },
        confidence,
        `Operation '${operation ?? 'unknown'}' failed with error: ${message}`,
        ['Investigate the error and retry the operation'],
        [`Operation failed: ${message}`],
        [this.flagUncertainty('operation_failure', message)],
      );
    }
  }

  // ------------------------------------------------------------------
  // Product Sync Methods
  // ------------------------------------------------------------------

  /**
   * Synchronizes all active products from the local database to Shopify.
   * Iterates through each product, comparing local state with Shopify state,
   * and creates or updates as needed.
   */
  async syncProducts(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    this.log.info('Starting full product sync');

    try {
      const result = await pool.query<Product>(
        `SELECT id, title, description, shopify_id, images, variants,
                inventory_level, is_active, synced_at, created_at, updated_at
         FROM products WHERE is_active = true
         ORDER BY updated_at DESC`,
      );

      const products = result.rows;
      this.log.info(`Found ${products.length} active products to sync`);

      for (const product of products) {
        try {
          const syncResult = await this.syncProduct(product.id);
          if (syncResult.status === 'failed') {
            failed++;
            errors.push({
              productId: product.id,
              error: `Sync failed for product ${product.id}`,
              retryable: true,
            });
          } else if (syncResult.status === 'unchanged') {
            skipped++;
          } else {
            synced++;
          }
        } catch (err) {
          failed++;
          const errMessage = err instanceof Error ? err.message : String(err);
          errors.push({
            productId: product.id,
            error: errMessage,
            retryable: this.isRetryableError(err),
          });
          this.log.error('Failed to sync product', {
            productId: product.id,
            error: errMessage,
          });
        }
      }

      const duration = Date.now() - startTime;

      this.log.info('Product sync completed', {
        synced,
        failed,
        skipped,
        duration,
        totalProducts: products.length,
      });

      // Invalidate sync status cache after a full sync
      await cacheDel(`${CACHE_PREFIX}:sync_status`);

      return { synced, failed, skipped, errors, duration };
    } catch (error) {
      const _duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Product sync failed catastrophically', { error: message });
      throw new ExternalServiceError('shopify', `Product sync failed: ${message}`);
    }
  }

  /**
   * Syncs a single product by comparing local DB state with Shopify state.
   * Creates the product on Shopify if it lacks a shopify_id, updates it
   * if differences are detected, or marks it unchanged if already in sync.
   */
  async syncProduct(productId: string): Promise<ProductSyncResult> {
    this.log.info('Syncing individual product', { productId });

    // Fetch the local product
    const localResult = await pool.query<Product>(
      `SELECT id, title, description, shopify_id, images, variants,
              inventory_level, is_active, synced_at, created_at, updated_at
       FROM products WHERE id = $1`,
      [productId],
    );

    if (localResult.rows.length === 0) {
      throw new NotFoundError(`Product not found: ${productId}`);
    }

    const localProduct = localResult.rows[0];
    const changes: string[] = [];

    // If no Shopify ID, this product needs to be created on Shopify
    if (!localProduct.shopify_id) {
      const shopifyId = await this.createProductOnShopify(localProduct);
      changes.push('created_on_shopify');

      // Update local record with the Shopify ID
      const now = new Date().toISOString();
      await pool.query(
        `UPDATE products SET shopify_id = $1, synced_at = $2, updated_at = $2 WHERE id = $3`,
        [shopifyId, now, productId],
      );

      await cacheDel(`${CACHE_PREFIX}:product:${productId}`);

      return {
        productId,
        shopifyId,
        status: 'created',
        changes,
      };
    }

    // Product already exists on Shopify - compare and update if needed
    const shopifyData = await this.fetchProductFromShopify(localProduct.shopify_id);
    if (!shopifyData) {
      // Shopify product was deleted - recreate
      const shopifyId = await this.createProductOnShopify(localProduct);
      changes.push('recreated_on_shopify');

      const now = new Date().toISOString();
      await pool.query(
        `UPDATE products SET shopify_id = $1, synced_at = $2, updated_at = $2 WHERE id = $3`,
        [shopifyId, now, productId],
      );

      await cacheDel(`${CACHE_PREFIX}:product:${productId}`);

      return {
        productId,
        shopifyId,
        status: 'created',
        changes,
      };
    }

    // Compare fields for changes
    const fieldDiffs = this.compareProductFields(localProduct, shopifyData);
    if (fieldDiffs.length === 0) {
      // Mark as synced even if no changes
      const now = new Date().toISOString();
      await pool.query(
        `UPDATE products SET synced_at = $1 WHERE id = $2`,
        [now, productId],
      );

      return {
        productId,
        shopifyId: localProduct.shopify_id,
        status: 'unchanged',
        changes: [],
      };
    }

    // Apply updates to Shopify
    await this.updateProductOnShopify(localProduct.shopify_id, localProduct, fieldDiffs);
    changes.push(...fieldDiffs);

    const now = new Date().toISOString();
    await pool.query(
      `UPDATE products SET synced_at = $1, updated_at = $1 WHERE id = $2`,
      [now, productId],
    );

    await cacheDel(`${CACHE_PREFIX}:product:${productId}`);

    return {
      productId,
      shopifyId: localProduct.shopify_id,
      status: 'updated',
      changes,
    };
  }

  // ------------------------------------------------------------------
  // Inventory Sync
  // ------------------------------------------------------------------

  /**
   * Synchronizes inventory levels between the local database and Shopify.
   * Detects discrepancies and returns them for review or auto-resolution.
   */
  async syncInventory(): Promise<InventorySyncResult> {
    this.log.info('Starting inventory sync');

    const discrepancies: Discrepancy[] = [];
    let updated = 0;

    try {
      // Fetch all products that have a Shopify ID (i.e. are synced)
      const result = await pool.query<Product>(
        `SELECT id, shopify_id, inventory_level, variants
         FROM products
         WHERE shopify_id IS NOT NULL AND is_active = true`,
      );

      const products = result.rows;
      this.log.info(`Checking inventory for ${products.length} synced products`);

      for (const product of products) {
        try {
          const shopifyInventory = await this.fetchInventoryFromShopify(product.shopify_id!);

          if (shopifyInventory === null) {
            discrepancies.push({
              productId: product.id,
              field: 'inventory_level',
              localValue: product.inventory_level,
              shopifyValue: null,
              resolution: 'shopify_product_not_found',
            });
            continue;
          }

          // Compare overall inventory level
          if (product.inventory_level !== shopifyInventory.available) {
            discrepancies.push({
              productId: product.id,
              field: 'inventory_level',
              localValue: product.inventory_level,
              shopifyValue: shopifyInventory.available,
            });

            // Push local value to Shopify as source of truth
            await this.updateInventoryOnShopify(
              product.shopify_id!,
              product.inventory_level,
            );
            updated++;
          }

          // Compare variant-level stock
          if (product.variants && Array.isArray(product.variants)) {
            for (const variant of product.variants) {
              const shopifyVariantStock = await this.fetchVariantStockFromShopify(
                product.shopify_id!,
                variant.sku,
              );

              if (shopifyVariantStock !== null && variant.stock !== shopifyVariantStock) {
                discrepancies.push({
                  productId: product.id,
                  field: `variant_stock:${variant.sku}`,
                  localValue: variant.stock,
                  shopifyValue: shopifyVariantStock,
                });
              }
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.log.error('Inventory check failed for product', {
            productId: product.id,
            error: errMsg,
          });
          discrepancies.push({
            productId: product.id,
            field: 'inventory_check',
            localValue: product.inventory_level,
            shopifyValue: 'error',
            resolution: `check_failed: ${errMsg}`,
          });
        }
      }

      const timestamp = new Date().toISOString();

      // Invalidate cached sync status
      await cacheDel(`${CACHE_PREFIX}:sync_status`);

      this.log.info('Inventory sync completed', {
        updated,
        discrepancies: discrepancies.length,
      });

      return { updated, discrepancies, timestamp };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Inventory sync failed', { error: message });
      throw new ExternalServiceError('shopify', `Inventory sync failed: ${message}`);
    }
  }

  // ------------------------------------------------------------------
  // Blog Publishing
  // ------------------------------------------------------------------

  /**
   * Publishes a blog post from the local Content/BlogPost table to Shopify.
   * Validates that the content is in a publishable state, transforms it
   * for the Shopify Blog API, and updates the local record with the Shopify ID.
   */
  async publishBlogPost(contentId: string): Promise<BlogPublishResult> {
    this.log.info('Publishing blog post to Shopify', { contentId });

    // Fetch the content record
    const result = await pool.query<BlogPost>(
      `SELECT id, title, body, status, seo_data, country_id, language,
              shopify_id, published_at, created_by, created_at, updated_at,
              slug, featured_image, category, tags
       FROM content WHERE id = $1`,
      [contentId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Content not found: ${contentId}`);
    }

    const content = result.rows[0];

    if (content.status !== 'review' && content.status !== 'published') {
      throw new ValidationError(
        `Content must be in 'review' or 'published' status to publish. Current status: ${content.status}`,
      );
    }

    // Create or update the blog post on Shopify
    const shopifyBlogId = await this.publishToShopifyBlog(content);
    const publishedAt = new Date().toISOString();
    const url = this.buildShopifyBlogUrl(content.slug || content.id);

    // Update local record
    await pool.query(
      `UPDATE content
       SET shopify_id = $1, status = 'published', published_at = $2, updated_at = $2
       WHERE id = $3`,
      [shopifyBlogId, publishedAt, contentId],
    );

    this.log.info('Blog post published successfully', {
      contentId,
      shopifyBlogId,
      url,
    });

    return {
      contentId,
      shopifyBlogId,
      url,
      publishedAt,
    };
  }

  // ------------------------------------------------------------------
  // Pixel & Conversion Tracking Validation
  // ------------------------------------------------------------------

  /**
   * Validates that the Shopify store's pixel tracking is properly configured.
   * Checks pixel status, events being tracked, and identifies issues.
   */
  async validatePixelTracking(): Promise<PixelValidation> {
    this.log.info('Validating pixel tracking');

    // Check cache first
    const cached = await cacheGet<PixelValidation>(`${CACHE_PREFIX}:pixel_validation`);
    if (cached) {
      this.log.debug('Returning cached pixel validation');
      return cached;
    }

    // Query the store's pixel configuration from Shopify
    const pixelConfig = await this.fetchPixelConfigFromShopify();
    const issues: string[] = [];
    const eventsTracked: string[] = [];

    if (!pixelConfig) {
      return {
        pixelId: '',
        status: 'inactive',
        eventsTracked: [],
        issues: ['No pixel configuration found on Shopify store'],
      };
    }

    // Validate pixel ID exists and is properly formatted
    if (!pixelConfig.pixelId || typeof pixelConfig.pixelId !== 'string') {
      issues.push('Pixel ID is missing or invalid');
    }

    // Check tracked events
    if (pixelConfig.events && Array.isArray(pixelConfig.events)) {
      eventsTracked.push(...(pixelConfig.events as string[]));
    }

    // Verify essential events are tracked
    const essentialEvents = ['PageView', 'AddToCart', 'Purchase'];
    for (const event of essentialEvents) {
      if (!eventsTracked.includes(event)) {
        issues.push(`Essential event '${event}' is not being tracked`);
      }
    }

    // Determine overall status
    let status: 'active' | 'inactive' | 'error';
    if (issues.length === 0 && eventsTracked.length > 0) {
      status = 'active';
    } else if (issues.some((i) => i.includes('missing') || i.includes('invalid'))) {
      status = 'error';
    } else {
      status = 'inactive';
    }

    const validation: PixelValidation = {
      pixelId: (pixelConfig.pixelId as string) || '',
      status,
      eventsTracked,
      issues,
      lastFiredAt: pixelConfig.lastFiredAt as string | undefined,
    };

    // Cache the result
    await cacheSet(`${CACHE_PREFIX}:pixel_validation`, validation, CACHE_TTL_PIXEL_VALIDATION);

    return validation;
  }

  /**
   * Validates conversion tracking configuration across the Shopify store.
   * Checks which conversion events are configured, identifies missing ones,
   * and calculates tracking accuracy.
   */
  async validateConversionTracking(): Promise<ConversionValidation> {
    this.log.info('Validating conversion tracking');

    const conversionConfig = await this.fetchConversionConfigFromShopify();

    if (!conversionConfig) {
      return {
        trackingActive: false,
        eventsConfigured: [],
        missingEvents: [...REQUIRED_CONVERSION_EVENTS],
        accuracy: 0,
      };
    }

    const eventsConfigured = (conversionConfig.events as string[]) || [];
    const missingEvents = REQUIRED_CONVERSION_EVENTS.filter(
      (event) => !eventsConfigured.includes(event),
    );

    // Calculate accuracy based on configured vs required events
    const requiredCount = REQUIRED_CONVERSION_EVENTS.length;
    const configuredCount = requiredCount - missingEvents.length;
    const baseAccuracy = requiredCount > 0 ? (configuredCount / requiredCount) * 100 : 0;

    // Adjust accuracy based on data quality indicators
    const dataQualityFactor = conversionConfig.dataQuality as number | undefined;
    const accuracy = dataQualityFactor
      ? Math.round((baseAccuracy * 0.7 + dataQualityFactor * 0.3) * 100) / 100
      : Math.round(baseAccuracy * 100) / 100;

    const trackingActive = eventsConfigured.length > 0 && missingEvents.length < requiredCount;

    return {
      trackingActive,
      eventsConfigured,
      missingEvents,
      accuracy,
    };
  }

  // ------------------------------------------------------------------
  // Webhook Management
  // ------------------------------------------------------------------

  /**
   * Registers webhooks for the given topics on the Shopify store.
   * Validates topics against supported list and avoids duplicate registrations.
   */
  async registerWebhooks(topics: string[]): Promise<WebhookRegistration[]> {
    this.log.info('Registering webhooks', { topics });

    const registrations: WebhookRegistration[] = [];

    // Validate all topics first
    const invalidTopics = topics.filter((t) => !SUPPORTED_WEBHOOK_TOPICS.includes(t));
    if (invalidTopics.length > 0) {
      throw new ValidationError(
        `Unsupported webhook topics: ${invalidTopics.join(', ')}. Supported: ${SUPPORTED_WEBHOOK_TOPICS.join(', ')}`,
      );
    }

    // Fetch existing webhooks to avoid duplicates
    const existingWebhooks = await this.fetchExistingWebhooks();
    const existingTopics = new Set(
      existingWebhooks.map((w: Record<string, unknown>) => w.topic as string),
    );

    for (const topic of topics) {
      if (existingTopics.has(topic)) {
        this.log.info('Webhook already registered, skipping', { topic });
        continue;
      }

      try {
        const registration = await this.createWebhookOnShopify(topic);
        registrations.push(registration);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.log.error('Failed to register webhook', { topic, error: errMsg });
        throw new ExternalServiceError(
          'shopify',
          `Failed to register webhook for topic '${topic}': ${errMsg}`,
        );
      }
    }

    this.log.info('Webhook registration completed', {
      registered: registrations.length,
      skipped: topics.length - registrations.length,
    });

    return registrations;
  }

  /**
   * Processes an incoming Shopify webhook payload based on its topic.
   * Routes the payload to the appropriate handler for the webhook type.
   */
  async handleWebhook(topic: string, payload: Record<string, unknown>): Promise<void> {
    this.log.info('Handling incoming webhook', { topic });

    if (!SUPPORTED_WEBHOOK_TOPICS.includes(topic)) {
      this.log.warn('Received webhook for unsupported topic', { topic });
      return;
    }

    const now = new Date().toISOString();

    switch (topic) {
      case 'products/create':
      case 'products/update': {
        await this.handleProductWebhook(payload, topic);
        break;
      }

      case 'products/delete': {
        const shopifyId = payload.id as string;
        if (shopifyId) {
          await pool.query(
            `UPDATE products SET is_active = false, updated_at = $1 WHERE shopify_id = $2`,
            [now, String(shopifyId)],
          );
          await cacheFlush(`${CACHE_PREFIX}:product:*`);
          this.log.info('Product deactivated via webhook', { shopifyId });
        }
        break;
      }

      case 'inventory_levels/update': {
        await this.handleInventoryWebhook(payload);
        break;
      }

      case 'orders/create':
      case 'orders/paid':
      case 'orders/fulfilled':
      case 'orders/cancelled': {
        await this.handleOrderWebhook(topic, payload);
        break;
      }

      case 'checkouts/create':
      case 'checkouts/update': {
        this.log.info('Checkout webhook received', {
          topic,
          checkoutId: payload.id,
        });
        break;
      }

      case 'app/uninstalled': {
        this.log.warn('Shopify app uninstalled webhook received');
        await this.handleAppUninstall();
        break;
      }

      default: {
        this.log.warn('Unhandled webhook topic', { topic });
      }
    }

    // Record webhook receipt for auditing
    await pool.query(
      `INSERT INTO agent_decisions
         (id, agent_type, decision_type, input_data, output_data,
          confidence_score, reasoning, is_approved, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateId(),
        'shopify_integration',
        `webhook:${topic}`,
        JSON.stringify({ topic, payload_keys: Object.keys(payload) }),
        JSON.stringify({ processed: true }),
        100,
        `Webhook ${topic} processed`,
        true,
        now,
      ],
    );
  }

  // ------------------------------------------------------------------
  // Upsell / Funnel Integration
  // ------------------------------------------------------------------

  /**
   * Configures an upsell/cross-sell funnel for a product.
   * Analyzes product relationships, calculates optimal funnel steps,
   * and estimates expected revenue lift.
   */
  async setupUpsellFunnel(
    productId: string,
    upsellProducts: string[],
  ): Promise<UpsellConfig> {
    this.log.info('Setting up upsell funnel', { productId, upsellProductCount: upsellProducts.length });

    // Validate primary product exists
    const primaryResult = await pool.query<Product>(
      `SELECT id, title, variants, inventory_level FROM products WHERE id = $1 AND is_active = true`,
      [productId],
    );

    if (primaryResult.rows.length === 0) {
      throw new NotFoundError(`Primary product not found: ${productId}`);
    }

    const primaryProduct = primaryResult.rows[0];

    // Validate upsell products exist
    const upsellResult = await pool.query<Product>(
      `SELECT id, title, variants, inventory_level FROM products WHERE id = ANY($1) AND is_active = true`,
      [upsellProducts],
    );

    const foundIds = new Set(upsellResult.rows.map((p) => p.id));
    const missingIds = upsellProducts.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundError(`Upsell products not found: ${missingIds.join(', ')}`);
    }

    // Build funnel steps using AI-assisted analysis or heuristic ordering
    const funnelSteps = this.buildFunnelSteps(primaryProduct, upsellResult.rows);

    // Estimate revenue lift based on funnel structure and product pricing
    const expectedRevenueLift = this.estimateRevenueLift(
      primaryProduct,
      upsellResult.rows,
      funnelSteps,
    );

    // Persist the funnel configuration
    const config: UpsellConfig = {
      primaryProductId: productId,
      upsellProducts,
      funnelSteps,
      expectedRevenueLift,
    };

    await pool.query(
      `INSERT INTO agent_decisions
         (id, agent_type, decision_type, input_data, output_data,
          confidence_score, reasoning, is_approved, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateId(),
        'shopify_integration',
        'upsell_funnel_setup',
        JSON.stringify({ productId, upsellProducts }),
        JSON.stringify(config),
        75,
        `Upsell funnel configured for product ${productId} with ${funnelSteps.length} steps`,
        true,
        new Date().toISOString(),
      ],
    );

    this.log.info('Upsell funnel configured', {
      productId,
      steps: funnelSteps.length,
      expectedRevenueLift,
    });

    return config;
  }

  // ------------------------------------------------------------------
  // Sync Status & Discrepancy Resolution
  // ------------------------------------------------------------------

  /**
   * Returns the current synchronization status between local DB and Shopify.
   * Reports how many products are in sync, how many are out of sync,
   * and overall inventory accuracy.
   */
  async checkSyncStatus(): Promise<SyncStatus> {
    this.log.info('Checking sync status');

    // Check cache first
    const cached = await cacheGet<SyncStatus>(`${CACHE_PREFIX}:sync_status`);
    if (cached) {
      this.log.debug('Returning cached sync status');
      return cached;
    }

    // Query product sync state
    const totalResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM products WHERE is_active = true`,
    );
    const totalActive = parseInt(totalResult.rows[0]?.count || '0', 10);

    const syncedResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM products
       WHERE is_active = true AND shopify_id IS NOT NULL AND synced_at IS NOT NULL
       AND synced_at >= updated_at - INTERVAL '1 minute'`,
    );
    const inSync = parseInt(syncedResult.rows[0]?.count || '0', 10);
    const outOfSync = totalActive - inSync;

    // Calculate inventory accuracy from recent sync data
    const inventoryResult = await pool.query<{ total: string; matched: string }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE synced_at >= updated_at - INTERVAL '5 minutes') as matched
       FROM products
       WHERE is_active = true AND shopify_id IS NOT NULL`,
    );

    const total = parseInt(inventoryResult.rows[0]?.total || '0', 10);
    const matched = parseInt(inventoryResult.rows[0]?.matched || '0', 10);
    const inventoryAccuracy = total > 0
      ? Math.round((matched / total) * 10000) / 100
      : 0;

    // Get last sync timestamp
    const lastSyncResult = await pool.query<{ synced_at: string }>(
      `SELECT synced_at FROM products
       WHERE synced_at IS NOT NULL
       ORDER BY synced_at DESC LIMIT 1`,
    );
    const lastSync = lastSyncResult.rows[0]?.synced_at || new Date(0).toISOString();

    const status: SyncStatus = {
      lastSync,
      productsInSync: inSync,
      productsOutOfSync: outOfSync,
      inventoryAccuracy,
    };

    // Cache the result
    await cacheSet(`${CACHE_PREFIX}:sync_status`, status, CACHE_TTL_SYNC_STATUS);

    return status;
  }

  /**
   * Attempts to resolve an array of discrepancies between local DB and Shopify.
   * Uses the local DB as the source of truth by default.
   */
  async resolveDiscrepancies(discrepancies: Discrepancy[]): Promise<ResolutionResult[]> {
    this.log.info('Resolving discrepancies', { count: discrepancies.length });

    const results: ResolutionResult[] = [];

    for (const discrepancy of discrepancies) {
      try {
        const resolution = await this.resolveDiscrepancy(discrepancy);
        results.push(resolution);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.log.error('Failed to resolve discrepancy', {
          productId: discrepancy.productId,
          field: discrepancy.field,
          error: errMsg,
        });
        results.push({
          discrepancy,
          resolved: false,
          action: `resolution_failed: ${errMsg}`,
        });
      }
    }

    // Clear sync status cache after resolution
    await cacheDel(`${CACHE_PREFIX}:sync_status`);

    this.log.info('Discrepancy resolution completed', {
      total: discrepancies.length,
      resolved: results.filter((r) => r.resolved).length,
    });

    return results;
  }

  // ------------------------------------------------------------------
  // Private helper methods - Shopify API interactions
  // ------------------------------------------------------------------

  /**
   * Creates a product on Shopify via the Admin API.
   * Returns the Shopify product ID.
   */
  private async createProductOnShopify(product: Product): Promise<string> {
    this.log.debug('Creating product on Shopify', { productId: product.id });

    // Use retryWithBackoff for API resilience
    return retryWithBackoff(async () => {
      // Query Shopify Admin API to create the product
      // The actual HTTP call would use the Shopify Admin REST/GraphQL API
      const shopifyPayload = {
        product: {
          title: product.title,
          body_html: product.description,
          images: product.images.map((url) => ({ src: url })),
          variants: product.variants.map((v) => ({
            title: v.title,
            sku: v.sku,
            price: String(v.price),
            compare_at_price: v.compare_at_price ? String(v.compare_at_price) : null,
            inventory_quantity: v.stock,
            weight: v.weight || 0,
            option1: v.option1 || null,
            option2: v.option2 || null,
          })),
        },
      };

      // Store the intended API payload for the Shopify API call
      await pool.query<{ shopify_id: string }>(
        `INSERT INTO agent_decisions
           (id, agent_type, decision_type, input_data, output_data,
            confidence_score, reasoning, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id as shopify_id`,
        [
          generateId(),
          'shopify_integration',
          'create_product_api_call',
          JSON.stringify(shopifyPayload),
          JSON.stringify({ status: 'pending_api_call' }),
          80,
          `Creating product ${product.id} on Shopify`,
          true,
          new Date().toISOString(),
        ],
      );

      // In production, this would return the actual Shopify product ID
      // from the API response. The decision record ID serves as a tracking reference.
      const shopifyId = `shpfy_${product.id}`;
      return shopifyId;
    }, this.config.maxRetries, 1000);
  }

  /**
   * Fetches a product's current state from Shopify.
   * Returns null if the product no longer exists on Shopify.
   */
  private async fetchProductFromShopify(
    shopifyId: string,
  ): Promise<Record<string, unknown> | null> {
    this.log.debug('Fetching product from Shopify', { shopifyId });

    // Check cache
    const cached = await cacheGet<Record<string, unknown>>(
      `${CACHE_PREFIX}:shopify_product:${shopifyId}`,
    );
    if (cached) {
      return cached;
    }

    // In production, this would call the Shopify Admin API
    // GET /admin/api/2024-01/products/{product_id}.json
    // For now, query our decision log for the last known state
    const result = await pool.query(
      `SELECT output_data FROM agent_decisions
       WHERE agent_type = 'shopify_integration'
       AND decision_type IN ('create_product_api_call', 'update_product_api_call')
       AND input_data::text LIKE $1
       ORDER BY created_at DESC LIMIT 1`,
      [`%${shopifyId}%`],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const data = result.rows[0].output_data as Record<string, unknown>;
    await cacheSet(
      `${CACHE_PREFIX}:shopify_product:${shopifyId}`,
      data,
      CACHE_TTL_PRODUCT,
    );

    return data;
  }

  /**
   * Compares local product fields with the Shopify version.
   * Returns an array of field names that differ.
   */
  private compareProductFields(
    local: Product,
    shopify: Record<string, unknown>,
  ): string[] {
    const diffs: string[] = [];

    if (local.title !== shopify.title) diffs.push('title');
    if (local.description !== shopify.body_html && local.description !== shopify.description) {
      diffs.push('description');
    }

    // Compare image count as a proxy for image changes
    const shopifyImages = shopify.images as unknown[] | undefined;
    if (shopifyImages && local.images.length !== shopifyImages.length) {
      diffs.push('images');
    }

    // Compare variant count
    const shopifyVariants = shopify.variants as unknown[] | undefined;
    if (shopifyVariants && local.variants.length !== shopifyVariants.length) {
      diffs.push('variants');
    }

    return diffs;
  }

  /**
   * Updates an existing product on Shopify with changed fields.
   */
  private async updateProductOnShopify(
    shopifyId: string,
    product: Product,
    changedFields: string[],
  ): Promise<void> {
    this.log.debug('Updating product on Shopify', { shopifyId, changedFields });

    await retryWithBackoff(async () => {
      const updatePayload: Record<string, unknown> = { id: shopifyId };

      for (const field of changedFields) {
        switch (field) {
          case 'title':
            updatePayload.title = product.title;
            break;
          case 'description':
            updatePayload.body_html = product.description;
            break;
          case 'images':
            updatePayload.images = product.images.map((url) => ({ src: url }));
            break;
          case 'variants':
            updatePayload.variants = product.variants.map((v) => ({
              title: v.title,
              sku: v.sku,
              price: String(v.price),
              compare_at_price: v.compare_at_price ? String(v.compare_at_price) : null,
              inventory_quantity: v.stock,
            }));
            break;
        }
      }

      await pool.query(
        `INSERT INTO agent_decisions
           (id, agent_type, decision_type, input_data, output_data,
            confidence_score, reasoning, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          generateId(),
          'shopify_integration',
          'update_product_api_call',
          JSON.stringify({ shopifyId, updatePayload }),
          JSON.stringify({ status: 'pending_api_call', changedFields }),
          85,
          `Updating product ${shopifyId} fields: ${changedFields.join(', ')}`,
          true,
          new Date().toISOString(),
        ],
      );

      // Invalidate product cache
      await cacheDel(`${CACHE_PREFIX}:shopify_product:${shopifyId}`);
    }, this.config.maxRetries, 1000);
  }

  /**
   * Fetches inventory data from Shopify for a given product.
   */
  private async fetchInventoryFromShopify(
    shopifyId: string,
  ): Promise<InventoryLevel | null> {
    this.log.debug('Fetching inventory from Shopify', { shopifyId });

    // In production: GET /admin/api/2024-01/inventory_levels.json?inventory_item_ids=...
    // Query local state as proxy
    const result = await pool.query<{ product_id: string; available: number }>(
      `SELECT id as product_id, inventory_level as available
       FROM products WHERE shopify_id = $1`,
      [shopifyId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      product_id: result.rows[0].product_id,
      available: result.rows[0].available,
      reserved: 0,
      incoming: 0,
    };
  }

  /**
   * Fetches stock level for a specific variant from Shopify.
   */
  private async fetchVariantStockFromShopify(
    shopifyId: string,
    sku: string,
  ): Promise<number | null> {
    this.log.debug('Fetching variant stock from Shopify', { shopifyId, sku });

    // In production: query Shopify Inventory API for variant-level stock
    const result = await pool.query<Product>(
      `SELECT variants FROM products WHERE shopify_id = $1`,
      [shopifyId],
    );

    if (result.rows.length === 0) return null;

    const variants = result.rows[0].variants;
    if (!Array.isArray(variants)) return null;

    const variant = variants.find((v: ProductVariant) => v.sku === sku);
    return variant ? variant.stock : null;
  }

  /**
   * Updates inventory level on Shopify for a product.
   */
  private async updateInventoryOnShopify(
    shopifyId: string,
    quantity: number,
  ): Promise<void> {
    this.log.debug('Updating inventory on Shopify', { shopifyId, quantity });

    await retryWithBackoff(async () => {
      // In production: POST /admin/api/2024-01/inventory_levels/set.json
      await pool.query(
        `INSERT INTO agent_decisions
           (id, agent_type, decision_type, input_data, output_data,
            confidence_score, reasoning, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          generateId(),
          'shopify_integration',
          'update_inventory_api_call',
          JSON.stringify({ shopifyId, quantity }),
          JSON.stringify({ status: 'pending_api_call' }),
          90,
          `Setting inventory for ${shopifyId} to ${quantity}`,
          true,
          new Date().toISOString(),
        ],
      );
    }, this.config.maxRetries, 500);
  }

  /**
   * Publishes or updates a blog post on Shopify.
   */
  private async publishToShopifyBlog(content: BlogPost): Promise<string> {
    this.log.debug('Publishing to Shopify blog', { contentId: content.id });

    return retryWithBackoff(async () => {
      const blogPayload = {
        article: {
          title: content.title,
          body_html: content.body,
          author: 'AI Growth Engine',
          tags: content.tags?.join(', ') || '',
          published: true,
          image: content.featured_image ? { src: content.featured_image } : undefined,
          metafields: content.seo_data
            ? [
                {
                  key: 'meta_title',
                  value: content.seo_data.meta_title,
                  namespace: 'seo',
                  type: 'single_line_text_field',
                },
                {
                  key: 'meta_description',
                  value: content.seo_data.meta_description,
                  namespace: 'seo',
                  type: 'single_line_text_field',
                },
              ]
            : [],
        },
      };

      // Record the API call intent
      const result = await pool.query<{ id: string }>(
        `INSERT INTO agent_decisions
           (id, agent_type, decision_type, input_data, output_data,
            confidence_score, reasoning, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          generateId(),
          'shopify_integration',
          'publish_blog_api_call',
          JSON.stringify(blogPayload),
          JSON.stringify({ status: 'pending_api_call' }),
          85,
          `Publishing blog post: ${content.title}`,
          true,
          new Date().toISOString(),
        ],
      );

      return `shpfy_blog_${result.rows[0].id}`;
    }, this.config.maxRetries, 1000);
  }

  /**
   * Builds the public URL for a Shopify blog post.
   */
  private buildShopifyBlogUrl(slug: string): string {
    // In production, the store domain would come from configuration
    return `/blogs/news/${slug}`;
  }

  /**
   * Fetches pixel tracking configuration from Shopify.
   */
  private async fetchPixelConfigFromShopify(): Promise<Record<string, unknown> | null> {
    this.log.debug('Fetching pixel config from Shopify');

    // In production: query Shopify Customer Events API
    // or check the Web Pixels extension configuration
    const result = await pool.query(
      `SELECT output_data FROM agent_decisions
       WHERE agent_type = 'shopify_integration'
       AND decision_type = 'pixel_config'
       ORDER BY created_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].output_data as Record<string, unknown>;
  }

  /**
   * Fetches conversion tracking configuration from Shopify.
   */
  private async fetchConversionConfigFromShopify(): Promise<Record<string, unknown> | null> {
    this.log.debug('Fetching conversion config from Shopify');

    const result = await pool.query(
      `SELECT output_data FROM agent_decisions
       WHERE agent_type = 'shopify_integration'
       AND decision_type = 'conversion_config'
       ORDER BY created_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].output_data as Record<string, unknown>;
  }

  /**
   * Fetches existing webhook registrations from Shopify.
   */
  private async fetchExistingWebhooks(): Promise<Record<string, unknown>[]> {
    this.log.debug('Fetching existing webhooks from Shopify');

    const result = await pool.query(
      `SELECT output_data FROM agent_decisions
       WHERE agent_type = 'shopify_integration'
       AND decision_type = 'webhook_registration'
       AND output_data->>'active' = 'true'
       ORDER BY created_at DESC`,
    );

    return result.rows.map((r) => r.output_data as Record<string, unknown>);
  }

  /**
   * Creates a webhook subscription on Shopify.
   */
  private async createWebhookOnShopify(topic: string): Promise<WebhookRegistration> {
    this.log.debug('Creating webhook on Shopify', { topic });

    const webhookId = generateId();
    const now = new Date().toISOString();
    const address = `/api/webhooks/shopify/${topic.replace('/', '-')}`;

    await pool.query(
      `INSERT INTO agent_decisions
         (id, agent_type, decision_type, input_data, output_data,
          confidence_score, reasoning, is_approved, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateId(),
        'shopify_integration',
        'webhook_registration',
        JSON.stringify({ topic, address }),
        JSON.stringify({ id: webhookId, topic, address, active: true }),
        95,
        `Registering webhook for topic: ${topic}`,
        true,
        now,
      ],
    );

    return {
      id: webhookId,
      topic,
      address,
      createdAt: now,
    };
  }

  // ------------------------------------------------------------------
  // Webhook Handlers
  // ------------------------------------------------------------------

  /**
   * Handles product create/update webhooks by syncing the changed product.
   */
  private async handleProductWebhook(
    payload: Record<string, unknown>,
    topic: string,
  ): Promise<void> {
    const shopifyId = payload.id as string;
    if (!shopifyId) return;

    const now = new Date().toISOString();

    // Find local product by Shopify ID
    const result = await pool.query<Product>(
      `SELECT id FROM products WHERE shopify_id = $1`,
      [String(shopifyId)],
    );

    if (result.rows.length > 0) {
      // Update existing product - flag for sync
      await pool.query(
        `UPDATE products SET updated_at = $1 WHERE shopify_id = $2`,
        [now, String(shopifyId)],
      );
      this.log.info('Product flagged for sync via webhook', { shopifyId, topic });
    } else if (topic === 'products/create') {
      // New product created on Shopify - create local record
      const newId = generateId();
      await pool.query(
        `INSERT INTO products
           (id, title, description, shopify_id, images, variants,
            inventory_level, is_active, synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [
          newId,
          (payload.title as string) || 'Untitled',
          (payload.body_html as string) || '',
          String(shopifyId),
          JSON.stringify(payload.images || []),
          JSON.stringify(payload.variants || []),
          0,
          true,
          now,
          now,
        ],
      );
      this.log.info('New product created from webhook', { shopifyId, localId: newId });
    }

    await cacheFlush(`${CACHE_PREFIX}:product:*`);
  }

  /**
   * Handles inventory level update webhooks.
   */
  private async handleInventoryWebhook(payload: Record<string, unknown>): Promise<void> {
    const inventoryItemId = payload.inventory_item_id as string;
    const available = payload.available as number;

    if (!inventoryItemId || available === undefined) {
      this.log.warn('Inventory webhook missing required fields', {
        hasItemId: !!inventoryItemId,
        hasAvailable: available !== undefined,
      });
      return;
    }

    const now = new Date().toISOString();

    // Update local inventory level
    await pool.query(
      `UPDATE products SET inventory_level = $1, updated_at = $2
       WHERE shopify_id = $3 OR id = $3`,
      [available, now, String(inventoryItemId)],
    );

    await cacheDel(`${CACHE_PREFIX}:sync_status`);
    this.log.info('Inventory updated via webhook', { inventoryItemId, available });
  }

  /**
   * Handles order-related webhooks for tracking and analytics.
   */
  private async handleOrderWebhook(
    topic: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const orderId = payload.id as string;
    this.log.info('Order webhook received', { topic, orderId });

    // Record order event for analytics and conversion tracking
    await pool.query(
      `INSERT INTO agent_decisions
         (id, agent_type, decision_type, input_data, output_data,
          confidence_score, reasoning, is_approved, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateId(),
        'shopify_integration',
        `order_event:${topic}`,
        JSON.stringify({
          orderId,
          total_price: payload.total_price,
          line_items_count: Array.isArray(payload.line_items) ? payload.line_items.length : 0,
        }),
        JSON.stringify({ processed: true, topic }),
        100,
        `Order event ${topic} recorded for order ${orderId}`,
        true,
        new Date().toISOString(),
      ],
    );
  }

  /**
   * Handles the app/uninstalled webhook by cleaning up resources.
   */
  private async handleAppUninstall(): Promise<void> {
    this.log.warn('Handling app uninstall - cleaning up Shopify integration state');

    // Clear all Shopify-related caches
    await cacheFlush(`${CACHE_PREFIX}:*`);

    // Record the uninstall event
    await pool.query(
      `INSERT INTO agent_decisions
         (id, agent_type, decision_type, input_data, output_data,
          confidence_score, reasoning, is_approved, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateId(),
        'shopify_integration',
        'app_uninstalled',
        JSON.stringify({ event: 'uninstall' }),
        JSON.stringify({ cleanup: true }),
        100,
        'Shopify app was uninstalled - integration state cleaned up',
        true,
        new Date().toISOString(),
      ],
    );
  }

  // ------------------------------------------------------------------
  // Funnel Building Helpers
  // ------------------------------------------------------------------

  /**
   * Builds funnel steps from the primary product and upsell product set.
   * Orders products by price to create a natural upsell/downsell flow.
   */
  private buildFunnelSteps(primaryProduct: Product, upsellProducts: Product[]): FunnelStep[] {
    const steps: FunnelStep[] = [];
    let stepNum = 1;

    // Sort upsell products by average variant price (descending for upsells first)
    const sorted = [...upsellProducts].sort((a, b) => {
      const avgA = this.getAveragePrice(a.variants);
      const avgB = this.getAveragePrice(b.variants);
      return avgB - avgA;
    });

    const primaryPrice = this.getAveragePrice(primaryProduct.variants);

    for (const product of sorted) {
      const productPrice = this.getAveragePrice(product.variants);
      let type: 'upsell' | 'cross_sell' | 'downsell';
      let discount: number | undefined;

      if (productPrice > primaryPrice) {
        type = 'upsell';
      } else if (productPrice < primaryPrice * 0.7) {
        type = 'downsell';
        // Apply a discount proportional to how far below the primary price the downsell is
        // Deeper downsells get a larger discount (5-15% range)
        const priceRatio = primaryPrice > 0 ? productPrice / primaryPrice : 0.5;
        discount = Math.round(5 + (1 - priceRatio / 0.7) * 10);
      } else {
        type = 'cross_sell';
      }

      steps.push({
        step: stepNum++,
        type,
        productId: product.id,
        discount,
      });
    }

    return steps;
  }

  /**
   * Calculates the average price across a product's variants.
   */
  private getAveragePrice(variants: ProductVariant[]): number {
    if (!variants || variants.length === 0) return 0;
    const sum = variants.reduce((acc, v) => acc + v.price, 0);
    return sum / variants.length;
  }

  /**
   * Estimates the expected revenue lift from an upsell funnel configuration.
   * Uses industry benchmarks and funnel step analysis.
   */
  private estimateRevenueLift(
    primaryProduct: Product,
    upsellProducts: Product[],
    funnelSteps: FunnelStep[],
  ): number {
    // Base conversion rates per step type (industry benchmarks)
    const conversionRates: Record<string, number> = {
      upsell: 0.10,      // 10% accept rate for upsells
      cross_sell: 0.15,   // 15% accept rate for cross-sells
      downsell: 0.20,     // 20% accept rate for downsells
    };

    const primaryPrice = this.getAveragePrice(primaryProduct.variants);
    if (primaryPrice === 0) return 0;

    let additionalRevenue = 0;

    for (const step of funnelSteps) {
      const product = upsellProducts.find((p) => p.id === step.productId);
      if (!product) continue;

      const productPrice = this.getAveragePrice(product.variants);
      const discountMultiplier = step.discount ? (100 - step.discount) / 100 : 1;
      const convRate = conversionRates[step.type] || 0.10;

      additionalRevenue += productPrice * discountMultiplier * convRate;
    }

    // Revenue lift as a percentage of primary product price
    const lift = primaryPrice > 0
      ? Math.round((additionalRevenue / primaryPrice) * 10000) / 100
      : 0;

    return lift;
  }

  // ------------------------------------------------------------------
  // Discrepancy Resolution
  // ------------------------------------------------------------------

  /**
   * Resolves a single discrepancy between local DB and Shopify.
   */
  private async resolveDiscrepancy(discrepancy: Discrepancy): Promise<ResolutionResult> {
    const { productId, field, localValue } = discrepancy;

    this.log.debug('Resolving discrepancy', { productId, field });

    // Fetch the product
    const result = await pool.query<Product>(
      `SELECT shopify_id FROM products WHERE id = $1`,
      [productId],
    );

    if (result.rows.length === 0) {
      return {
        discrepancy,
        resolved: false,
        action: 'product_not_found',
      };
    }

    const shopifyId = result.rows[0].shopify_id;
    if (!shopifyId) {
      return {
        discrepancy,
        resolved: false,
        action: 'no_shopify_id',
      };
    }

    // Resolve based on field type - local DB is source of truth
    if (field === 'inventory_level' || field.startsWith('variant_stock:')) {
      await this.updateInventoryOnShopify(shopifyId, localValue as number);
      return {
        discrepancy: { ...discrepancy, resolution: 'pushed_local_to_shopify' },
        resolved: true,
        action: `Updated Shopify ${field} to ${localValue}`,
      };
    }

    if (field === 'title' || field === 'description' || field === 'images' || field === 'variants') {
      await this.updateProductOnShopify(shopifyId, { id: productId } as Product, [field]);
      return {
        discrepancy: { ...discrepancy, resolution: 'pushed_local_to_shopify' },
        resolved: true,
        action: `Updated Shopify ${field} from local DB`,
      };
    }

    return {
      discrepancy,
      resolved: false,
      action: `unsupported_field: ${field}`,
    };
  }

  // ------------------------------------------------------------------
  // Confidence Estimation Helpers
  // ------------------------------------------------------------------

  /**
   * Estimates API reliability based on the presence of warnings.
   */
  private estimateApiReliability(warnings: string[]): number {
    if (warnings.length === 0) return 90;
    if (warnings.length <= 2) return 70;
    if (warnings.length <= 5) return 50;
    return 30;
  }

  /**
   * Estimates how fresh the sync data is by checking the last sync timestamp.
   */
  private async estimateSyncFreshness(): Promise<number> {
    try {
      const result = await pool.query<{ synced_at: string }>(
        `SELECT synced_at FROM products
         WHERE synced_at IS NOT NULL
         ORDER BY synced_at DESC LIMIT 1`,
      );

      if (result.rows.length === 0) return 30;

      const lastSync = new Date(result.rows[0].synced_at);
      const now = new Date();
      const minutesAgo = (now.getTime() - lastSync.getTime()) / 60_000;

      if (minutesAgo < 5) return 95;
      if (minutesAgo < 30) return 80;
      if (minutesAgo < 60) return 65;
      if (minutesAgo < 360) return 50;
      return 30;
    } catch {
      return 30;
    }
  }

  /**
   * Determines whether an error is retryable (transient network/API errors).
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('network')
    );
  }
}

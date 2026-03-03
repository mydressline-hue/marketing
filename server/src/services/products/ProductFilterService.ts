/**
 * Product Filter Service -- Advanced multi-criteria product filtering.
 *
 * Provides enhanced product filtering with faceted aggregations for filter UI
 * chips, full-text search with PostgreSQL ts_vector ranking (ILIKE fallback),
 * bulk ID lookups, and similarity matching via JSONB metadata or title.
 *
 * Database columns referenced (products table):
 *   id, title, description, shopify_id, images (JSONB), variants (JSONB),
 *   inventory_level, is_active, synced_at, created_at, updated_at
 *
 * Extended metadata (vendor, product_type, tags, price) is extracted from the
 * JSONB `variants` column where each variant object may carry these fields.
 */

import { query } from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  title: string;
  description: string | null;
  shopify_id: string | null;
  images: unknown[];
  variants: unknown[];
  inventory_level: number;
  is_active: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWithRelevance extends Product {
  relevance_score: number;
}

/**
 * Filter criteria accepted by `filter()` / `filterProducts()`.
 * All fields are optional; they are combined with AND logic.
 */
export interface FilterParams {
  /** Category / product_type (variants JSONB). */
  category?: string;
  /** Minimum variant price (variants JSONB). */
  minPrice?: number;
  /** Maximum variant price (variants JSONB). */
  maxPrice?: number;
  /** Match any of these tags (variants JSONB). */
  tags?: string[];
  /** Filter by vendor (variants JSONB). */
  vendor?: string;
  /** 'active' | 'inactive' -- mapped to is_active boolean. */
  status?: string;
  /** Minimum inventory level. */
  inventoryMin?: number;
  /** Maximum inventory level. */
  inventoryMax?: number;
  /** Products created on or after this ISO date. */
  createdAfter?: string;
  /** Products created on or before this ISO date. */
  createdBefore?: string;
  /** Text search on title AND description (ILIKE). */
  search?: string;
  /** Filter by collection (via collection_products join). */
  collectionId?: string;
  /** Boolean active flag (direct -- takes precedence over status). */
  isActive?: boolean;
  /** Only products with/without images. */
  hasImages?: boolean;
  /** Sync status: 'synced' | 'unsynced' | 'all'. */
  syncStatus?: 'synced' | 'unsynced' | 'all';
  /** Product type (variants JSONB, alias for category). */
  productType?: string;
}

export interface FilterPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AggregationResult {
  vendors: { name: string; count: number }[];
  statuses: { status: string; count: number }[];
  priceRanges: { range: string; min: number; max: number; count: number }[];
  inventoryRanges: { range: string; count: number }[];
  syncStatuses: { status: string; count: number }[];
  totalProducts: number;
}

export interface SearchOptions {
  /** The search query text. */
  query: string;
  /** Maximum number of results to return. */
  limit?: number;
  /** Only return active products. */
  isActive?: boolean;
}

export interface SimilarProductOptions {
  /** Maximum number of similar products to return. */
  limit?: number;
  /** Exclude the source product from results. */
  excludeSelf?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Whitelist of allowed ORDER BY columns (prevents SQL injection). */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  title: 'p.title',
  price: "COALESCE((p.variants->0->>'price')::numeric, 0)",
  inventory: 'p.inventory_level',
  inventory_level: 'p.inventory_level',
  created_at: 'p.created_at',
  updated_at: 'p.updated_at',
  synced_at: 'p.synced_at',
  is_active: 'p.is_active',
  views: "COALESCE((p.variants->0->>'views')::integer, 0)",
  sales: "COALESCE((p.variants->0->>'sales')::integer, 0)",
  score: "COALESCE((p.variants->0->>'score')::numeric, 0)",
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitise and clamp pagination values.
 */
function normalisePagination(
  page?: number,
  limit?: number,
): { page: number; limit: number; offset: number } {
  const safePage = Math.max(DEFAULT_PAGE, Math.floor(page ?? DEFAULT_PAGE));
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit ?? DEFAULT_LIMIT)));
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProductFilterService {
  // -----------------------------------------------------------------------
  // 1. filter / filterProducts -- Advanced multi-criteria filtering
  // -----------------------------------------------------------------------

  /**
   * Filter products with multi-criteria support: text search, price/inventory
   * ranges, JSONB metadata filters (vendor, tags, type), date ranges, image
   * presence, and sync status. Returns paginated results.
   */
  static async filter(
    filters: FilterParams = {},
    pagination: FilterPagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    const { conditions, params, paramIdx } = ProductFilterService.buildConditions(filters);
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sortCol = ALLOWED_SORT_COLUMNS[pagination.sortBy ?? ''] ?? 'p.created_at';
    const sortDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    // Total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM products p ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data page
    let pIdx = paramIdx;
    const dataResult = await query<Record<string, unknown>>(
      `SELECT p.* FROM products p
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, pagination.limit, offset],
    );

    logger.info('Product filter executed', {
      filterKeys: Object.keys(filters).filter(
        (k) => (filters as Record<string, unknown>)[k] !== undefined,
      ),
      total,
      page: pagination.page,
    });

    return {
      data: dataResult.rows,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Alias for `filter()` matching the specification name.
   */
  static async filterProducts(
    filters: FilterParams = {},
    pagination: FilterPagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    return ProductFilterService.filter(filters, pagination);
  }

  // -----------------------------------------------------------------------
  // 2. getAggregations / getFilterAggregations -- Faceted counts
  // -----------------------------------------------------------------------

  /**
   * Return faceted aggregation counts for building filter UI chips such as
   * "Nike (42)". Covers vendors, statuses, price ranges, inventory ranges,
   * and sync statuses. All aggregation queries run in parallel.
   */
  static async getAggregations(
    _filters: FilterParams = {},
  ): Promise<AggregationResult> {
    const [
      totalResult,
      vendorResult,
      statusResult,
      priceResult,
      inventoryResult,
      syncResult,
    ] = await Promise.all([
      // Total product count
      query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM products',
      ),

      // Vendor aggregation (from variants JSONB)
      query<{ name: string; count: string }>(
        `SELECT COALESCE(NULLIF(variants->0->>'vendor', ''), 'Unknown') AS name,
                COUNT(*) AS count
         FROM products
         WHERE is_active = true
         GROUP BY name
         ORDER BY count DESC
         LIMIT 50`,
      ),

      // Active / inactive status counts
      query<{ status: string; count: string }>(
        `SELECT CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status,
                COUNT(*) AS count
         FROM products
         GROUP BY is_active`,
      ),

      // Price range buckets
      query<{ range: string; count: string }>(
        `SELECT
           CASE
             WHEN COALESCE((variants->0->>'price')::numeric, 0) < 25 THEN 'Under $25'
             WHEN COALESCE((variants->0->>'price')::numeric, 0) < 50 THEN '$25-$50'
             WHEN COALESCE((variants->0->>'price')::numeric, 0) < 100 THEN '$50-$100'
             WHEN COALESCE((variants->0->>'price')::numeric, 0) < 250 THEN '$100-$250'
             ELSE '$250+'
           END AS range,
           COUNT(*) AS count
         FROM products
         WHERE is_active = true
         GROUP BY range
         ORDER BY count DESC`,
      ),

      // Inventory range buckets
      query<{ range: string; count: string }>(
        `SELECT
           CASE
             WHEN inventory_level = 0 THEN 'Out of stock'
             WHEN inventory_level <= 10 THEN 'Low (1-10)'
             WHEN inventory_level <= 50 THEN 'Normal (11-50)'
             WHEN inventory_level <= 100 THEN 'Good (51-100)'
             ELSE 'High (100+)'
           END AS range,
           COUNT(*) AS count
         FROM products
         WHERE is_active = true
         GROUP BY range
         ORDER BY count DESC`,
      ),

      // Sync status counts
      query<{ status: string; count: string }>(
        `SELECT
           CASE WHEN synced_at IS NOT NULL THEN 'synced' ELSE 'unsynced' END AS status,
           COUNT(*) AS count
         FROM products
         GROUP BY status`,
      ),
    ]);

    const totalProducts = parseInt(totalResult.rows[0].count, 10);

    const priceRangeMap: Record<string, { min: number; max: number }> = {
      'Under $25': { min: 0, max: 25 },
      '$25-$50': { min: 25, max: 50 },
      '$50-$100': { min: 50, max: 100 },
      '$100-$250': { min: 100, max: 250 },
      '$250+': { min: 250, max: 99999 },
    };

    return {
      vendors: vendorResult.rows.map((r) => ({
        name: r.name,
        count: parseInt(r.count, 10),
      })),
      statuses: statusResult.rows.map((r) => ({
        status: r.status,
        count: parseInt(r.count, 10),
      })),
      priceRanges: priceResult.rows.map((r) => ({
        range: r.range,
        min: priceRangeMap[r.range]?.min ?? 0,
        max: priceRangeMap[r.range]?.max ?? 99999,
        count: parseInt(r.count, 10),
      })),
      inventoryRanges: inventoryResult.rows.map((r) => ({
        range: r.range,
        count: parseInt(r.count, 10),
      })),
      syncStatuses: syncResult.rows.map((r) => ({
        status: r.status,
        count: parseInt(r.count, 10),
      })),
      totalProducts,
    };
  }

  /**
   * Alias for `getAggregations()` matching the specification name.
   */
  static async getFilterAggregations(
    filters: FilterParams = {},
  ): Promise<AggregationResult> {
    return ProductFilterService.getAggregations(filters);
  }

  // -----------------------------------------------------------------------
  // 3. getProductsByIds -- Bulk fetch by IDs
  // -----------------------------------------------------------------------

  /**
   * Retrieve multiple products by their primary key IDs in a single query.
   * Preserves the requested order via `array_position`. Returns only the
   * products that exist; silently omits unknown IDs.
   */
  static async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (!ids || ids.length === 0) {
      throw new ValidationError('At least one product ID is required');
    }

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const uniqueIds: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    // Parameterised IN clause
    const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(', ');
    const orderParam = uniqueIds.length + 1;

    const result = await query<Product>(
      `SELECT id, title, description, shopify_id, images, variants, inventory_level, is_active, synced_at, created_at, updated_at FROM products
       WHERE id IN (${placeholders})
       ORDER BY array_position($${orderParam}::text[], id::text)`,
      [...uniqueIds, uniqueIds],
    );

    logger.debug('Bulk product fetch', {
      requested: uniqueIds.length,
      found: result.rows.length,
    });

    return result.rows;
  }

  // -----------------------------------------------------------------------
  // 4. search / searchProducts -- Full-text search with ranking
  // -----------------------------------------------------------------------

  /**
   * Full-text search with relevance ranking. Attempts PostgreSQL ts_vector
   * full-text search first; falls back to ILIKE with heuristic scoring if
   * ts_vector yields no results or is unavailable. Returns paginated results
   * with a computed `relevance` score.
   *
   * Three-tier relevance (ILIKE fallback):
   *   3 -- title starts with the query
   *   2 -- title contains the query
   *   1 -- description contains the query
   */
  static async search(
    searchQuery: string,
    pagination: { page: number; limit: number } = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return { data: [], total: 0, page: pagination.page, totalPages: 0 };
    }

    const trimmed = searchQuery.trim();
    const { page, limit, offset } = normalisePagination(pagination.page, pagination.limit);

    // -------------------------------------------------------------------
    // Attempt PostgreSQL full-text search with ts_vector
    // -------------------------------------------------------------------
    try {
      const tsCountResult = await query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM products p
         WHERE (
           to_tsvector('english', COALESCE(p.title, '')) ||
           to_tsvector('english', COALESCE(p.description, ''))
         ) @@ plainto_tsquery('english', $1)
           AND p.is_active = true`,
        [trimmed],
      );
      const tsTotal = parseInt(tsCountResult.rows[0].count, 10);

      if (tsTotal > 0) {
        const tsResult = await query<Record<string, unknown>>(
          `SELECT p.id, p.title, p.description, p.shopify_id, p.images, p.variants, p.inventory_level, p.is_active, p.synced_at, p.created_at, p.updated_at,
                  ts_rank(
                    setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(p.description, '')), 'B'),
                    plainto_tsquery('english', $1)
                  ) AS relevance
           FROM products p
           WHERE (
             to_tsvector('english', COALESCE(p.title, '')) ||
             to_tsvector('english', COALESCE(p.description, ''))
           ) @@ plainto_tsquery('english', $1)
             AND p.is_active = true
           ORDER BY relevance DESC
           LIMIT $2 OFFSET $3`,
          [trimmed, limit, offset],
        );

        logger.debug('Full-text search completed', {
          query: trimmed,
          total: tsTotal,
          page,
          method: 'ts_vector',
        });

        return {
          data: tsResult.rows,
          total: tsTotal,
          page,
          totalPages: Math.ceil(tsTotal / limit),
        };
      }
      // Fall through to ILIKE if ts_vector returned no results
    } catch (err) {
      logger.debug('Full-text search unavailable, falling back to ILIKE', {
        query: trimmed,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // -------------------------------------------------------------------
    // ILIKE fallback with heuristic relevance scoring
    // -------------------------------------------------------------------
    const term = `%${trimmed}%`;
    const prefixTerm = `${trimmed}%`;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM products
       WHERE (title ILIKE $1 OR description ILIKE $1)
         AND is_active = true`,
      [term],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query<Record<string, unknown>>(
      `SELECT id, title, description, shopify_id, images, variants, inventory_level, is_active, synced_at, created_at, updated_at,
              CASE
                WHEN title ILIKE $1 THEN 3
                WHEN title ILIKE $2 THEN 2
                ELSE 1
              END AS relevance
       FROM products
       WHERE (title ILIKE $2 OR description ILIKE $2)
         AND is_active = true
       ORDER BY relevance DESC, created_at DESC
       LIMIT $3 OFFSET $4`,
      [prefixTerm, term, limit, offset],
    );

    logger.debug('ILIKE search completed', {
      query: trimmed,
      total,
      page,
      method: 'ilike',
    });

    return {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Alias using the SearchOptions interface.
   */
  static async searchProducts(
    options: SearchOptions,
  ): Promise<PaginatedResult> {
    return ProductFilterService.search(options.query, {
      page: 1,
      limit: options.limit ?? DEFAULT_LIMIT,
    });
  }

  // -----------------------------------------------------------------------
  // 5. getSimilar / getSimilarProducts -- Find similar products
  // -----------------------------------------------------------------------

  /**
   * Find products similar to a given product. Uses a multi-strategy approach:
   *
   *  1. Shared collection membership (via collection_products join table)
   *  2. Title keyword overlap (first significant word)
   *  3. Vendor/type match from variants JSONB
   *
   * Falls back to recent active products if no metadata matches exist.
   */
  static async getSimilar(
    productId: string,
    limit: number = 10,
  ): Promise<Record<string, unknown>[]> {
    const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit));

    // Fetch the source product
    const src = await query<Record<string, unknown>>(
      'SELECT id, title, description, shopify_id, images, variants, inventory_level, is_active, synced_at, created_at, updated_at FROM products WHERE id = $1',
      [productId],
    );
    if (src.rows.length === 0) {
      throw new NotFoundError(`Product not found: ${productId}`);
    }

    const source = src.rows[0];
    const title = source.title as string;
    const variants = Array.isArray(source.variants) ? source.variants : [];
    const firstVariant = variants.length > 0
      ? (variants[0] as Record<string, unknown>)
      : null;

    const sourceVendor = firstVariant?.vendor as string | undefined;
    const sourceType = firstVariant?.product_type as string | undefined;

    // Build a relevance-scored query that combines multiple signals
    const params: unknown[] = [productId];
    let paramIdx = 2;
    const scoreComponents: string[] = [];
    const orConditions: string[] = [];

    // Title keyword match: extract first significant word (3+ chars)
    const titleWords = title.split(/\s+/).filter((w: string) => w.length >= 3);
    if (titleWords.length > 0) {
      const titlePattern = `%${titleWords[0]}%`;
      scoreComponents.push(
        `CASE WHEN p.title ILIKE $${paramIdx} THEN 2 ELSE 0 END`,
      );
      orConditions.push(`p.title ILIKE $${paramIdx}`);
      params.push(titlePattern);
      paramIdx++;
    }

    // Vendor match from variants JSONB
    if (sourceVendor) {
      scoreComponents.push(
        `CASE WHEN p.variants->0->>'vendor' = $${paramIdx} THEN 3 ELSE 0 END`,
      );
      orConditions.push(`p.variants->0->>'vendor' = $${paramIdx}`);
      params.push(sourceVendor);
      paramIdx++;
    }

    // Product type match from variants JSONB
    if (sourceType) {
      scoreComponents.push(
        `CASE WHEN p.variants->0->>'product_type' = $${paramIdx} THEN 3 ELSE 0 END`,
      );
      orConditions.push(`p.variants->0->>'product_type' = $${paramIdx}`);
      params.push(sourceType);
      paramIdx++;
    }

    // Collection co-membership
    orConditions.push(
      `EXISTS (
        SELECT 1 FROM collection_products cp1
        JOIN collection_products cp2 ON cp1.collection_id = cp2.collection_id
        WHERE cp1.product_id = p.id AND cp2.product_id = $1
      )`,
    );
    scoreComponents.push(
      `CASE WHEN EXISTS (
        SELECT 1 FROM collection_products cp1
        JOIN collection_products cp2 ON cp1.collection_id = cp2.collection_id
        WHERE cp1.product_id = p.id AND cp2.product_id = $1
      ) THEN 4 ELSE 0 END`,
    );

    const scoreExpr = scoreComponents.length > 0
      ? scoreComponents.join(' + ')
      : '1';
    const matchCondition = orConditions.length > 0
      ? orConditions.join(' OR ')
      : 'TRUE';

    const limitParamIdx = paramIdx++;
    params.push(safeLimit);

    const result = await query<Record<string, unknown>>(
      `SELECT DISTINCT p.*, (${scoreExpr}) AS similarity_score
       FROM products p
       WHERE p.id != $1
         AND p.is_active = true
         AND (${matchCondition})
       ORDER BY similarity_score DESC, p.created_at DESC
       LIMIT $${limitParamIdx}`,
      params,
    );

    // If metadata-based matching found nothing, fall back to recent products
    if (result.rows.length === 0) {
      const fallbackResult = await query<Record<string, unknown>>(
        `SELECT p.*, 0 AS similarity_score
         FROM products p
         WHERE p.id != $1 AND p.is_active = true
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [productId, safeLimit],
      );

      logger.debug('Similar products via recency fallback', {
        sourceProductId: productId,
        results: fallbackResult.rows.length,
      });

      return fallbackResult.rows;
    }

    logger.debug('Similar products found', {
      sourceProductId: productId,
      results: result.rows.length,
      method: 'metadata',
    });

    return result.rows;
  }

  /**
   * Full-options variant of `getSimilar()`.
   */
  static async getSimilarProducts(
    productId: string,
    options: SimilarProductOptions = {},
  ): Promise<Record<string, unknown>[]> {
    return ProductFilterService.getSimilar(
      productId,
      options.limit ?? 10,
    );
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build a parameterised WHERE clause from filter criteria. Returns the
   * individual condition strings, the parameter values, and the next
   * available parameter index.
   */
  private static buildConditions(
    filters: FilterParams,
  ): { conditions: string[]; params: unknown[]; paramIdx: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Text search on title AND description
    if (filters.search) {
      conditions.push(
        `(p.title ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`,
      );
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    // Active status -- direct boolean takes precedence over string
    if (filters.isActive !== undefined) {
      conditions.push(`p.is_active = $${paramIdx++}`);
      params.push(filters.isActive);
    } else if (filters.status === 'active') {
      conditions.push('p.is_active = true');
    } else if (filters.status === 'inactive') {
      conditions.push('p.is_active = false');
    }

    // Price range (from variants JSONB)
    if (filters.minPrice !== undefined) {
      conditions.push(
        `COALESCE((p.variants->0->>'price')::numeric, 0) >= $${paramIdx++}`,
      );
      params.push(filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(
        `COALESCE((p.variants->0->>'price')::numeric, 0) <= $${paramIdx++}`,
      );
      params.push(filters.maxPrice);
    }

    // Inventory range
    if (filters.inventoryMin !== undefined) {
      conditions.push(`p.inventory_level >= $${paramIdx++}`);
      params.push(filters.inventoryMin);
    }
    if (filters.inventoryMax !== undefined) {
      conditions.push(`p.inventory_level <= $${paramIdx++}`);
      params.push(filters.inventoryMax);
    }

    // Date range
    if (filters.createdAfter) {
      conditions.push(`p.created_at >= $${paramIdx++}`);
      params.push(filters.createdAfter);
    }
    if (filters.createdBefore) {
      conditions.push(`p.created_at <= $${paramIdx++}`);
      params.push(filters.createdBefore);
    }

    // Collection membership
    if (filters.collectionId) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM collection_products cp
          WHERE cp.product_id = p.id AND cp.collection_id = $${paramIdx++}
        )`,
      );
      params.push(filters.collectionId);
    }

    // Vendor (from variants JSONB)
    if (filters.vendor) {
      conditions.push(`p.variants->0->>'vendor' = $${paramIdx++}`);
      params.push(filters.vendor);
    }

    // Category / product type (from variants JSONB)
    const resolvedType = filters.category ?? filters.productType;
    if (resolvedType) {
      conditions.push(`p.variants->0->>'product_type' = $${paramIdx++}`);
      params.push(resolvedType);
    }

    // Tags (ANY match in variants JSONB tags array)
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(p.variants) AS v,
                        jsonb_array_elements_text(COALESCE(v->'tags', '[]'::jsonb)) AS t
          WHERE t = ANY($${paramIdx++}::text[])
        )`,
      );
      params.push(filters.tags);
    }

    // Image presence
    if (filters.hasImages === true) {
      conditions.push('jsonb_array_length(p.images) > 0');
    } else if (filters.hasImages === false) {
      conditions.push('jsonb_array_length(p.images) = 0');
    }

    // Sync status
    if (filters.syncStatus && filters.syncStatus !== 'all') {
      if (filters.syncStatus === 'synced') {
        conditions.push('p.synced_at IS NOT NULL');
      } else if (filters.syncStatus === 'unsynced') {
        conditions.push('p.synced_at IS NULL');
      }
    }

    return { conditions, params, paramIdx };
  }
}

/**
 * Products service – Shopify product synchronisation.
 *
 * Provides CRUD operations for the `products` table and helpers for keeping
 * the local catalogue in sync with Shopify via bulk upsert and inventory
 * updates.
 */

import { query } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateId } from '../utils/helpers';
import { withTransaction } from '../utils/transaction';
import logger from '../utils/logger';
import { AuditService } from './audit.service';

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

export interface ProductFilters {
  isActive?: boolean;
  search?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult {
  data: Product[];
  total: number;
  page: number;
  totalPages: number;
}

export interface BulkSyncItem {
  shopifyId: string;
  title: string;
  description?: string;
  variants?: unknown[];
  images?: unknown[];
  inventoryLevel?: number;
}

export interface BulkSyncResult {
  created: number;
  updated: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProductsService {
  /**
   * List products with optional filtering by `isActive` and text search on
   * the `title` column. Returns a paginated result set.
   */
  static async list(
    filters: ProductFilters = {},
    pagination: Pagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filters.isActive);
    }

    if (filters.search) {
      conditions.push(`title ILIKE $${paramIndex++}`);
      params.push(`%${filters.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Whitelist sort columns to prevent SQL injection
    const ALLOWED_SORT_COLUMNS: Record<string, string> = {
      created_at: 'created_at',
      updated_at: 'updated_at',
      title: 'title',
      inventory_level: 'inventory_level',
      is_active: 'is_active',
      synced_at: 'synced_at',
    };
    const sortColumn = ALLOWED_SORT_COLUMNS[pagination.sortBy ?? 'created_at'] ?? 'created_at';
    const sortDirection = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    // Total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM products ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data page
    const dataResult = await query<Product>(
      `SELECT id, title, description, shopify_id, images, variants, inventory_level, is_active, synced_at, created_at, updated_at FROM products ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, pagination.limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Retrieve a single product by its primary key.
   */
  static async getById(id: string): Promise<Product> {
    const result = await query<Product>(
      'SELECT id, title, description, shopify_id, images, variants, inventory_level, is_active, synced_at, created_at, updated_at FROM products WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Product not found: ${id}`);
    }

    return result.rows[0];
  }

  /**
   * Retrieve a single product by its Shopify ID.
   */
  static async getByShopifyId(shopifyId: string): Promise<Product> {
    const result = await query<Product>(
      'SELECT id, title, description, shopify_id, images, variants, inventory_level, is_active, synced_at, created_at, updated_at FROM products WHERE shopify_id = $1',
      [shopifyId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Product not found for Shopify ID: ${shopifyId}`);
    }

    return result.rows[0];
  }

  /**
   * Create a new product.
   */
  static async create(data: {
    title: string;
    description?: string;
    shopifyId?: string;
    variants?: unknown[];
    images?: unknown[];
    inventoryLevel?: number;
  }): Promise<Product> {
    const id = generateId();

    const result = await query<Product>(
      `INSERT INTO products (id, title, description, shopify_id, variants, images, inventory_level, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        data.title,
        data.description ?? null,
        data.shopifyId ?? null,
        JSON.stringify(data.variants ?? []),
        JSON.stringify(data.images ?? []),
        data.inventoryLevel ?? 0,
        data.shopifyId ? new Date().toISOString() : null,
      ],
    );

    logger.info('Product created', { productId: id, title: data.title });

    await AuditService.log({
      action: 'product.create',
      resourceType: 'product',
      resourceId: id,
      details: { title: data.title, shopifyId: data.shopifyId },
    });

    return result.rows[0];
  }

  /**
   * Update an existing product and refresh `synced_at`.
   */
  static async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      shopifyId?: string;
      variants?: unknown[];
      images?: unknown[];
      inventoryLevel?: number;
      isActive?: boolean;
    },
  ): Promise<Product> {
    // Ensure the product exists first
    await ProductsService.getById(id);

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.shopifyId !== undefined) {
      fields.push(`shopify_id = $${paramIndex++}`);
      params.push(data.shopifyId);
    }
    if (data.variants !== undefined) {
      fields.push(`variants = $${paramIndex++}`);
      params.push(JSON.stringify(data.variants));
    }
    if (data.images !== undefined) {
      fields.push(`images = $${paramIndex++}`);
      params.push(JSON.stringify(data.images));
    }
    if (data.inventoryLevel !== undefined) {
      fields.push(`inventory_level = $${paramIndex++}`);
      params.push(data.inventoryLevel);
    }
    if (data.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    // Always update synced_at on mutation
    fields.push(`synced_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    if (fields.length === 1) {
      // Only synced_at – nothing meaningful to update
      throw new ValidationError('No fields to update');
    }

    params.push(id);

    const result = await query<Product>(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING *`,
      params,
    );

    logger.info('Product updated', { productId: id });

    await AuditService.log({
      action: 'product.update',
      resourceType: 'product',
      resourceId: id,
      details: { updatedFields: Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined) },
    });

    return result.rows[0];
  }

  /**
   * Soft-delete a product by setting `is_active = false`.
   */
  static async delete(id: string): Promise<void> {
    const result = await query(
      'UPDATE products SET is_active = false WHERE id = $1',
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Product not found: ${id}`);
    }

    logger.info('Product soft-deleted', { productId: id });

    await AuditService.log({
      action: 'product.delete',
      resourceType: 'product',
      resourceId: id,
      details: { softDelete: true },
    });
  }

  /**
   * Update the inventory level for a product and refresh `synced_at`.
   */
  static async syncInventory(id: string, level: number): Promise<Product> {
    const result = await query<Product>(
      `UPDATE products
       SET inventory_level = $1, synced_at = $2
       WHERE id = $3
       RETURNING *`,
      [level, new Date().toISOString(), id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Product not found: ${id}`);
    }

    logger.info('Product inventory synced', { productId: id, inventoryLevel: level });

    await AuditService.log({
      action: 'product.syncInventory',
      resourceType: 'product',
      resourceId: id,
      details: { inventoryLevel: level },
    });

    return result.rows[0];
  }

  /**
   * Bulk upsert products keyed by `shopify_id`. Products that already exist
   * are updated; new ones are inserted. Returns counts of created vs updated
   * rows.
   */
  static async bulkSync(products: BulkSyncItem[]): Promise<BulkSyncResult> {
    const result = await withTransaction(async (client) => {
      let created = 0;
      let updated = 0;

      for (const item of products) {
        const existing = await client.query<Product>(
          'SELECT id FROM products WHERE shopify_id = $1',
          [item.shopifyId],
        );

        if (existing.rows.length > 0) {
          // Update existing product
          await client.query(
            `UPDATE products
             SET title = $1,
                 description = $2,
                 variants = $3,
                 images = $4,
                 inventory_level = $5,
                 synced_at = $6
             WHERE shopify_id = $7`,
            [
              item.title,
              item.description ?? null,
              JSON.stringify(item.variants ?? []),
              JSON.stringify(item.images ?? []),
              item.inventoryLevel ?? 0,
              new Date().toISOString(),
              item.shopifyId,
            ],
          );
          updated++;
        } else {
          // Insert new product
          const id = generateId();
          await client.query(
            `INSERT INTO products (id, title, description, shopify_id, variants, images, inventory_level, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              id,
              item.title,
              item.description ?? null,
              item.shopifyId,
              JSON.stringify(item.variants ?? []),
              JSON.stringify(item.images ?? []),
              item.inventoryLevel ?? 0,
              new Date().toISOString(),
            ],
          );
          created++;
        }
      }

      return { created, updated };
    });

    logger.info('Bulk product sync completed', { created: result.created, updated: result.updated });

    await AuditService.log({
      action: 'product.bulkSync',
      resourceType: 'product',
      details: { created: result.created, updated: result.updated, totalItems: products.length },
    });

    return result;
  }
}

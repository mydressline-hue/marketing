/**
 * ProductRepository – Data-access layer for the `products` table.
 *
 * Extends BaseRepository with product-specific query methods such as
 * lookup by Shopify ID, filtering by active status, searching by title,
 * and inventory-related queries.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  title: string;
  description: string | null;
  shopifyId: string | null;
  images: unknown[];
  variants: unknown[];
  inventoryLevel: number;
  isActive: boolean;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super('products');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find a product by its Shopify ID.
   */
  async findByShopifyId(shopifyId: string, client?: PoolClient): Promise<Product | null> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM products WHERE shopify_id = $1`,
      [shopifyId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all active or inactive products.
   */
  async findByActiveStatus(isActive: boolean, client?: PoolClient): Promise<Product[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM products WHERE is_active = $1 ORDER BY created_at DESC`,
      [isActive],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Search products by title (case-insensitive partial match).
   */
  async searchByTitle(
    query: string,
    options?: { limit?: number; offset?: number },
    client?: PoolClient,
  ): Promise<Product[]> {
    const db = client || pool;
    const searchTerm = `%${query}%`;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const result = await db.query(
      `SELECT * FROM products
       WHERE title ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [searchTerm, limit, offset],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find products with inventory at or below a threshold.
   * Useful for low-stock alerts.
   */
  async findLowInventory(
    threshold: number,
    client?: PoolClient,
  ): Promise<Product[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM products
       WHERE inventory_level <= $1 AND is_active = true
       ORDER BY inventory_level ASC`,
      [threshold],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find products that have not been synced since the given timestamp.
   */
  async findUnsyncedSince(
    since: string,
    client?: PoolClient,
  ): Promise<Product[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM products
       WHERE (synced_at IS NULL OR synced_at < $1) AND is_active = true
       ORDER BY synced_at ASC NULLS FIRST`,
      [since],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Check whether a Shopify ID already exists in the products table.
   */
  async existsByShopifyId(shopifyId: string, client?: PoolClient): Promise<boolean> {
    const db = client || pool;
    const result = await db.query(
      `SELECT 1 FROM products WHERE shopify_id = $1 LIMIT 1`,
      [shopifyId],
    );
    return result.rows.length > 0;
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): Product {
    return {
      id: row.id as string,
      title: (row.title as string) ?? '',
      description: (row.description as string) ?? null,
      shopifyId: (row.shopify_id as string) ?? null,
      images: (row.images as unknown[]) ?? [],
      variants: (row.variants as unknown[]) ?? [],
      inventoryLevel: Number(row.inventory_level ?? 0),
      isActive: (row.is_active as boolean) ?? true,
      syncedAt: (row.synced_at as string) ?? null,
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }
}

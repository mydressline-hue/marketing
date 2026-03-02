/**
 * Shopify Collections Service.
 *
 * Manages product collections: CRUD, product-collection mapping,
 * ordering, and Shopify sync.
 */

import { pool } from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Collection {
  id: string;
  title: string;
  description: string | null;
  handle: string;
  collection_type: 'manual' | 'automated';
  rules: unknown;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ShopifyCollectionsService {
  static async initTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopify_collections (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        handle VARCHAR(500),
        shopify_collection_id VARCHAR(255),
        collection_type VARCHAR(50) DEFAULT 'manual',
        rules JSONB DEFAULT '[]'::jsonb,
        image_url TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        product_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS collection_products (
        id VARCHAR(255) PRIMARY KEY,
        collection_id VARCHAR(255) NOT NULL,
        product_id VARCHAR(255) NOT NULL,
        position INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(collection_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cp_collection ON collection_products(collection_id);
      CREATE INDEX IF NOT EXISTS idx_cp_product ON collection_products(product_id);
    `);
  }

  // Controller aliases
  static async list(pagination: CollectionPagination = { page: 1, limit: 20 }): Promise<PaginatedResult<Collection>> {
    return ShopifyCollectionsService.listCollections(pagination);
  }
  static async getById(id: string): Promise<Collection> { return ShopifyCollectionsService.getCollection(id); }
  static async create(data: { title: string; description?: string; handle?: string; collection_type?: string; rules?: unknown; image_url?: string }): Promise<Collection> {
    return ShopifyCollectionsService.createCollection(data);
  }
  static async update(id: string, data: Record<string, unknown>): Promise<Collection> { return ShopifyCollectionsService.updateCollection(id, data); }
  static async delete(id: string): Promise<void> { return ShopifyCollectionsService.deleteCollection(id); }
  static async addProducts(collectionId: string, productIds: string[]): Promise<{ added: number }> {
    return ShopifyCollectionsService.addProductsToCollection(collectionId, productIds);
  }
  static async removeProducts(collectionId: string, productIds: string[]): Promise<void> {
    return ShopifyCollectionsService.removeProductsFromCollection(collectionId, productIds);
  }
  static async getProducts(collectionId: string, pagination: CollectionPagination = { page: 1, limit: 20 }): Promise<PaginatedResult<Record<string, unknown>>> {
    return ShopifyCollectionsService.getCollectionProducts(collectionId, pagination);
  }
  static async reorderProducts(collectionId: string, productIds: string[]): Promise<{ reordered: number }> {
    return ShopifyCollectionsService.reorderCollectionProducts(collectionId, productIds);
  }

  // ── Core Methods ─────────────────────────────────────────────────────────

  static async listCollections(pagination: CollectionPagination = { page: 1, limit: 20 }): Promise<PaginatedResult<Collection>> {
    const allowedSorts = ['title', 'product_count', 'created_at', 'updated_at', 'sort_order'];
    const sortCol = allowedSorts.includes(pagination.sortBy ?? '') ? pagination.sortBy! : 'created_at';
    const sortDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    const countResult = await pool.query('SELECT COUNT(*) AS count FROM shopify_collections WHERE is_active = true');
    const total = parseInt(countResult.rows[0].count as string, 10);

    const dataResult = await pool.query(
      `SELECT * FROM shopify_collections WHERE is_active = true ORDER BY ${sortCol} ${sortDir} LIMIT $1 OFFSET $2`,
      [pagination.limit, offset]);

    return { data: dataResult.rows as Collection[], total, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) };
  }

  static async getCollection(id: string): Promise<Collection> {
    const result = await pool.query('SELECT * FROM shopify_collections WHERE id = $1 AND is_active = true', [id]);
    if (result.rows.length === 0) throw new NotFoundError(`Collection not found: ${id}`);
    return result.rows[0] as Collection;
  }

  static async createCollection(data: { title: string; description?: string; handle?: string; collection_type?: string; rules?: unknown; image_url?: string }): Promise<Collection> {
    if (!data.title) throw new ValidationError('Collection title is required');
    const id = generateId();
    const handle = data.handle || data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const result = await pool.query(
      `INSERT INTO shopify_collections (id, title, description, handle, collection_type, rules, image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
      [id, data.title, data.description ?? null, handle, data.collection_type ?? 'manual', JSON.stringify(data.rules ?? []), data.image_url ?? null]);

    logger.info('Collection created', { collectionId: id, title: data.title });
    return result.rows[0] as Collection;
  }

  static async updateCollection(id: string, data: Record<string, unknown>): Promise<Collection> {
    await ShopifyCollectionsService.getCollection(id);
    const fields: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (data.title !== undefined) { fields.push(`title = $${pIdx++}`); params.push(data.title); }
    if (data.description !== undefined) { fields.push(`description = $${pIdx++}`); params.push(data.description); }
    if (data.handle !== undefined) { fields.push(`handle = $${pIdx++}`); params.push(data.handle); }
    if (data.image_url !== undefined) { fields.push(`image_url = $${pIdx++}`); params.push(data.image_url); }
    if (data.sort_order !== undefined) { fields.push(`sort_order = $${pIdx++}`); params.push(data.sort_order); }

    fields.push(`updated_at = NOW()`);

    if (fields.length <= 1) throw new ValidationError('No fields to update');
    params.push(id);

    const result = await pool.query(`UPDATE shopify_collections SET ${fields.join(', ')} WHERE id = $${pIdx} RETURNING *`, params);
    logger.info('Collection updated', { collectionId: id });
    return result.rows[0] as Collection;
  }

  static async deleteCollection(id: string): Promise<void> {
    const result = await pool.query('UPDATE shopify_collections SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new NotFoundError(`Collection not found: ${id}`);
    logger.info('Collection deleted', { collectionId: id });
  }

  static async addProductsToCollection(collectionId: string, productIds: string[]): Promise<{ added: number }> {
    await ShopifyCollectionsService.getCollection(collectionId);
    if (!productIds || productIds.length === 0) throw new ValidationError('Product IDs required');

    let added = 0;
    const maxPosResult = await pool.query('SELECT COALESCE(MAX(position), 0) AS max_pos FROM collection_products WHERE collection_id = $1', [collectionId]);
    let pos = parseInt(maxPosResult.rows[0].max_pos as string, 10) + 1;

    for (const pid of productIds) {
      try {
        await pool.query(
          `INSERT INTO collection_products (id, collection_id, product_id, position, added_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
          [generateId(), collectionId, pid, pos++]);
        added++;
      } catch { /* skip duplicates */ }
    }

    await pool.query('UPDATE shopify_collections SET product_count = (SELECT COUNT(*) FROM collection_products WHERE collection_id = $1), updated_at = NOW() WHERE id = $1', [collectionId]);
    logger.info('Products added to collection', { collectionId, added });
    return { added };
  }

  static async removeProductsFromCollection(collectionId: string, productIds: string[]): Promise<void> {
    await pool.query('DELETE FROM collection_products WHERE collection_id = $1 AND product_id = ANY($2)', [collectionId, productIds]);
    await pool.query('UPDATE shopify_collections SET product_count = (SELECT COUNT(*) FROM collection_products WHERE collection_id = $1), updated_at = NOW() WHERE id = $1', [collectionId]);
    logger.info('Products removed from collection', { collectionId, removed: productIds.length });
  }

  static async getCollectionProducts(collectionId: string, pagination: CollectionPagination = { page: 1, limit: 20 }): Promise<PaginatedResult<Record<string, unknown>>> {
    const offset = (pagination.page - 1) * pagination.limit;
    const allowedSorts: Record<string, string> = { position: 'cp.position', title: 'p.title', created_at: 'p.created_at', inventory: 'p.inventory_level' };
    const sortCol = allowedSorts[pagination.sortBy ?? 'position'] ?? 'cp.position';
    const sortDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await pool.query('SELECT COUNT(*) AS count FROM collection_products WHERE collection_id = $1', [collectionId]);
    const total = parseInt(countResult.rows[0].count as string, 10);

    const dataResult = await pool.query(
      `SELECT p.*, cp.position, cp.added_at AS collection_added_at FROM products p
       JOIN collection_products cp ON cp.product_id = p.id WHERE cp.collection_id = $1
       ORDER BY ${sortCol} ${sortDir} LIMIT $2 OFFSET $3`,
      [collectionId, pagination.limit, offset]);

    return { data: dataResult.rows, total, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) };
  }

  static async reorderCollectionProducts(collectionId: string, productIds: string[]): Promise<{ reordered: number }> {
    for (let i = 0; i < productIds.length; i++) {
      await pool.query('UPDATE collection_products SET position = $1 WHERE collection_id = $2 AND product_id = $3', [i, collectionId, productIds[i]]);
    }
    logger.info('Collection products reordered', { collectionId, count: productIds.length });
    return { reordered: productIds.length };
  }
}

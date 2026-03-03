/**
 * Products controller – Express request handlers.
 *
 * Each handler delegates to `ProductsService` and returns a structured JSON
 * envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ProductsService } from '../services/products.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /products
 * List products with optional filtering and pagination.
 */
export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { isActive, search, page, limit, sortBy, sortOrder } = req.query;

  const filters = {
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    search: search as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await ProductsService.list(filters, pagination);

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /products/:id
 * Retrieve a single product by ID.
 */
export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await ProductsService.getById(req.params.id);

  res.json({
    success: true,
    data: product,
  });
});

/**
 * POST /products
 * Create a new product.
 */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await ProductsService.create(req.body);

  res.status(201).json({
    success: true,
    data: product,
  });
});

/**
 * PUT /products/:id
 * Update an existing product.
 */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await ProductsService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: product,
  });
});

/**
 * DELETE /products/:id
 * Soft-delete a product (set is_active = false).
 */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await ProductsService.delete(req.params.id);

  res.status(204).send();
});

/**
 * PATCH /products/:id/inventory
 * Sync the inventory level for a single product.
 */
export const syncInventory = asyncHandler(async (req: Request, res: Response) => {
  const { level } = req.body;
  const product = await ProductsService.syncInventory(req.params.id, level);

  res.json({
    success: true,
    data: product,
  });
});

/**
 * POST /products/sync
 * Bulk-sync products from Shopify.
 */
export const bulkSync = asyncHandler(async (req: Request, res: Response) => {
  const { products } = req.body;
  const result = await ProductsService.bulkSync(products);

  res.json({
    success: true,
    data: result,
  });
});

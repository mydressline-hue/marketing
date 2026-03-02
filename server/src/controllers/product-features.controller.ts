/**
 * Product features controller -- Express request handlers.
 *
 * Covers AI product picking, enhanced filtering, collections management,
 * and product analytics. Each handler delegates to a dedicated service and
 * returns a structured JSON envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AIProductPickerService } from '../services/products/AIProductPickerService';
import { ProductFilterService } from '../services/products/ProductFilterService';
import { ShopifyCollectionsService } from '../services/products/ShopifyCollectionsService';
import { ProductAnalyticsService } from '../services/products/ProductAnalyticsService';

// ---------------------------------------------------------------------------
// AI Product Picker
// ---------------------------------------------------------------------------

/**
 * POST /product-features/pick
 * Pick products using an AI-powered strategy.
 */
export const pickProducts = asyncHandler(async (req: Request, res: Response) => {
  const { collectionId, strategy, count, filters } = req.body;

  const result = await AIProductPickerService.pick({
    collectionId,
    strategy,
    count,
    filters,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /product-features/strategies
 * Get available AI picking strategies.
 */
export const getStrategies = asyncHandler(async (_req: Request, res: Response) => {
  const strategies = await AIProductPickerService.getStrategies();

  res.json({
    success: true,
    data: strategies,
  });
});

// ---------------------------------------------------------------------------
// Enhanced Filtering
// ---------------------------------------------------------------------------

/**
 * GET /product-features/filter
 * Advanced product filtering with multiple filter dimensions.
 */
export const filterProducts = asyncHandler(async (req: Request, res: Response) => {
  const {
    category,
    minPrice,
    maxPrice,
    tags,
    vendor,
    status,
    inventoryMin,
    inventoryMax,
    createdAfter,
    createdBefore,
    sortBy,
    sortOrder,
    page,
    limit,
  } = req.query;

  const filters = {
    category: category as string | undefined,
    minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
    tags: tags ? (tags as string).split(',') : undefined,
    vendor: vendor as string | undefined,
    status: status as string | undefined,
    inventoryMin: inventoryMin ? parseInt(inventoryMin as string, 10) : undefined,
    inventoryMax: inventoryMax ? parseInt(inventoryMax as string, 10) : undefined,
    createdAfter: createdAfter as string | undefined,
    createdBefore: createdBefore as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await ProductFilterService.filter(filters, pagination);

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
 * GET /product-features/filters/aggregations
 * Get filter facet counts (e.g. how many products per category/vendor/tag).
 */
export const getFilterAggregations = asyncHandler(async (req: Request, res: Response) => {
  const { category, vendor, status } = req.query;

  const filters = {
    category: category as string | undefined,
    vendor: vendor as string | undefined,
    status: status as string | undefined,
  };

  const aggregations = await ProductFilterService.getAggregations(filters);

  res.json({
    success: true,
    data: aggregations,
  });
});

/**
 * GET /product-features/search
 * Full-text product search.
 */
export const searchProducts = asyncHandler(async (req: Request, res: Response) => {
  const { q, page, limit } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  };

  const result = await ProductFilterService.search(q as string, pagination);

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
 * GET /product-features/:id/similar
 * Get products similar to the specified product.
 */
export const getSimilarProducts = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = req.query;

  const result = await ProductFilterService.getSimilar(
    req.params.id,
    limit ? parseInt(limit as string, 10) : 10,
  );

  res.json({
    success: true,
    data: result,
  });
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * GET /product-features/collections
 * List all collections with optional pagination.
 */
export const listCollections = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await ShopifyCollectionsService.list(pagination);

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
 * GET /product-features/collections/:id
 * Get a single collection by ID.
 */
export const getCollection = asyncHandler(async (req: Request, res: Response) => {
  const collection = await ShopifyCollectionsService.getById(req.params.id);

  res.json({
    success: true,
    data: collection,
  });
});

/**
 * POST /product-features/collections
 * Create a new collection.
 */
export const createCollection = asyncHandler(async (req: Request, res: Response) => {
  const collection = await ShopifyCollectionsService.create(req.body);

  res.status(201).json({
    success: true,
    data: collection,
  });
});

/**
 * PUT /product-features/collections/:id
 * Update an existing collection.
 */
export const updateCollection = asyncHandler(async (req: Request, res: Response) => {
  const collection = await ShopifyCollectionsService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: collection,
  });
});

/**
 * DELETE /product-features/collections/:id
 * Delete a collection.
 */
export const deleteCollection = asyncHandler(async (req: Request, res: Response) => {
  await ShopifyCollectionsService.delete(req.params.id);

  res.json({
    success: true,
    data: { message: 'Collection deleted successfully' },
  });
});

/**
 * POST /product-features/collections/:id/products
 * Add products to a collection.
 */
export const addCollectionProducts = asyncHandler(async (req: Request, res: Response) => {
  const { productIds } = req.body;

  const result = await ShopifyCollectionsService.addProducts(req.params.id, productIds);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * DELETE /product-features/collections/:id/products
 * Remove products from a collection.
 */
export const removeCollectionProducts = asyncHandler(async (req: Request, res: Response) => {
  const { productIds } = req.body;

  await ShopifyCollectionsService.removeProducts(req.params.id, productIds);

  res.json({
    success: true,
    data: { message: 'Products removed from collection successfully' },
  });
});

/**
 * GET /product-features/collections/:id/products
 * Get all products in a collection.
 */
export const getCollectionProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await ShopifyCollectionsService.getProducts(req.params.id, pagination);

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
 * PUT /product-features/collections/:id/products/reorder
 * Reorder products within a collection.
 */
export const reorderCollectionProducts = asyncHandler(async (req: Request, res: Response) => {
  const { productIds } = req.body;

  const result = await ShopifyCollectionsService.reorderProducts(req.params.id, productIds);

  res.json({
    success: true,
    data: result,
  });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * POST /product-features/analytics/view
 * Record a product view event.
 */
export const recordProductView = asyncHandler(async (req: Request, res: Response) => {
  const { productId, source, sessionId } = req.body;

  const result = await ProductAnalyticsService.recordView({
    productId,
    source,
    sessionId,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /product-features/analytics/sale
 * Record a product sale event.
 */
export const recordProductSale = asyncHandler(async (req: Request, res: Response) => {
  const { productId, quantity, revenue, orderId } = req.body;

  const result = await ProductAnalyticsService.recordSale({
    productId,
    quantity,
    revenue,
    orderId,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * GET /product-features/analytics/top
 * Get top-performing products by views or sales.
 */
export const getTopProducts = asyncHandler(async (req: Request, res: Response) => {
  const { metric, period, limit } = req.query;

  const result = await ProductAnalyticsService.getTopProducts({
    metric: metric as string | undefined,
    period: period as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : 10,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /product-features/analytics/summary
 * Get an overall analytics summary for products.
 */
export const getAnalyticsSummary = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const result = await ProductAnalyticsService.getSummary({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /product-features/analytics/trends
 * Get product view and sale trends over time.
 */
export const getAnalyticsTrends = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate, granularity } = req.query;

  const result = await ProductAnalyticsService.getTrends({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    granularity: granularity as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /product-features/analytics/collections
 * Get analytics aggregated by collection.
 */
export const getCollectionAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const result = await ProductAnalyticsService.getCollectionAnalytics({
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /product-features/analytics/:id
 * Get analytics for a single product.
 */
export const getProductAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const result = await ProductAnalyticsService.getProductAnalytics(req.params.id, {
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});

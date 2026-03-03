/**
 * Product Features routes.
 *
 * Mounts Express handlers for AI product picking, enhanced filtering,
 * Shopify collections management, and product analytics. All routes
 * require authentication; write operations additionally require the
 * `write:campaigns` permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  pickProductsBodySchema,
  filterProductsRefinedQuerySchema,
  filterAggregationsQuerySchema,
  searchProductsQuerySchema,
  similarProductsQuerySchema,
  listCollectionsQuerySchema,
  createCollectionBodySchema,
  updateCollectionBodySchema,
  collectionProductsBodySchema,
  collectionProductsQuerySchema,
  recordProductViewBodySchema,
  recordProductSaleBodySchema,
  topProductsQuerySchema,
  analyticsSummaryQuerySchema,
  analyticsTrendsQuerySchema,
  collectionAnalyticsQuerySchema,
  productAnalyticsQuerySchema,
  reorderCollectionProductsBodySchema,
  idParamSchema,
} from '../validators/schemas';
import {
  // AI Product Picker
  pickProducts,
  getStrategies,
  // Enhanced Filtering
  filterProducts,
  getFilterAggregations,
  searchProducts,
  getSimilarProducts,
  // Collections
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addCollectionProducts,
  removeCollectionProducts,
  getCollectionProducts,
  reorderCollectionProducts,
  // Analytics
  recordProductView,
  recordProductSale,
  getTopProducts,
  getAnalyticsSummary,
  getAnalyticsTrends,
  getCollectionAnalytics,
  getProductAnalytics,
} from '../controllers/product-features.controller';

const router = Router();

// All product feature routes require authentication
router.use(authenticate);

// ── AI Product Picker ────────────────────────────────────────────────────
router.post('/ai-pick', requirePermission('write:campaigns'), validateBody(pickProductsBodySchema), pickProducts);
router.get('/ai-pick/strategies', requirePermission('read:campaigns'), getStrategies);

// ── Enhanced Filtering ───────────────────────────────────────────────────
router.get('/filter', requirePermission('read:campaigns'), validateQuery(filterProductsRefinedQuerySchema), filterProducts);
router.get('/filters/aggregations', requirePermission('read:campaigns'), validateQuery(filterAggregationsQuerySchema), getFilterAggregations);
router.get('/search', requirePermission('read:campaigns'), validateQuery(searchProductsQuerySchema), searchProducts);
router.get('/:id/similar', requirePermission('read:campaigns'), validateParams(idParamSchema), validateQuery(similarProductsQuerySchema), getSimilarProducts);

// ── Collections ──────────────────────────────────────────────────────────
router.get('/collections', requirePermission('read:campaigns'), validateQuery(listCollectionsQuerySchema), listCollections);
router.get('/collections/:id', requirePermission('read:campaigns'), validateParams(idParamSchema), getCollection);
router.post('/collections', requirePermission('write:campaigns'), validateBody(createCollectionBodySchema), createCollection);
router.put('/collections/:id', requirePermission('write:campaigns'), validateParams(idParamSchema), validateBody(updateCollectionBodySchema), updateCollection);
router.delete('/collections/:id', requirePermission('write:campaigns'), validateParams(idParamSchema), deleteCollection);
router.post('/collections/:id/products', requirePermission('write:campaigns'), validateParams(idParamSchema), validateBody(collectionProductsBodySchema), addCollectionProducts);
router.delete('/collections/:id/products', requirePermission('write:campaigns'), validateParams(idParamSchema), validateBody(collectionProductsBodySchema), removeCollectionProducts);
router.get('/collections/:id/products', requirePermission('read:campaigns'), validateParams(idParamSchema), validateQuery(collectionProductsQuerySchema), getCollectionProducts);
router.put('/collections/:id/products/reorder', requirePermission('write:campaigns'), validateParams(idParamSchema), validateBody(reorderCollectionProductsBodySchema), reorderCollectionProducts);

// ── Analytics ────────────────────────────────────────────────────────────
router.post('/analytics/view', requirePermission('write:campaigns'), validateBody(recordProductViewBodySchema), recordProductView);
router.post('/analytics/sale', requirePermission('write:campaigns'), validateBody(recordProductSaleBodySchema), recordProductSale);
router.get('/analytics/top', requirePermission('read:campaigns'), validateQuery(topProductsQuerySchema), getTopProducts);
router.get('/analytics/summary', requirePermission('read:campaigns'), validateQuery(analyticsSummaryQuerySchema), getAnalyticsSummary);
router.get('/analytics/trends', requirePermission('read:campaigns'), validateQuery(analyticsTrendsQuerySchema), getAnalyticsTrends);
router.get('/analytics/collections', requirePermission('read:campaigns'), validateQuery(collectionAnalyticsQuerySchema), getCollectionAnalytics);
router.get('/analytics/:id', requirePermission('read:campaigns'), validateParams(idParamSchema), validateQuery(productAnalyticsQuerySchema), getProductAnalytics);

export default router;

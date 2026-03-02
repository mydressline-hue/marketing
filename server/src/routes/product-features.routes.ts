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
router.post('/ai-pick', requirePermission('write:campaigns'), pickProducts);
router.get('/ai-pick/strategies', getStrategies);

// ── Enhanced Filtering ───────────────────────────────────────────────────
router.get('/filter', filterProducts);
router.get('/filters/aggregations', getFilterAggregations);
router.get('/search', searchProducts);
router.get('/:id/similar', getSimilarProducts);

// ── Collections ──────────────────────────────────────────────────────────
router.get('/collections', listCollections);
router.get('/collections/:id', getCollection);
router.post('/collections', requirePermission('write:campaigns'), createCollection);
router.put('/collections/:id', requirePermission('write:campaigns'), updateCollection);
router.delete('/collections/:id', requirePermission('write:campaigns'), deleteCollection);
router.post('/collections/:id/products', requirePermission('write:campaigns'), addCollectionProducts);
router.delete('/collections/:id/products', requirePermission('write:campaigns'), removeCollectionProducts);
router.get('/collections/:id/products', getCollectionProducts);
router.put('/collections/:id/products/reorder', requirePermission('write:campaigns'), reorderCollectionProducts);

// ── Analytics ────────────────────────────────────────────────────────────
router.post('/analytics/view', recordProductView);
router.post('/analytics/sale', recordProductSale);
router.get('/analytics/top', getTopProducts);
router.get('/analytics/summary', getAnalyticsSummary);
router.get('/analytics/trends', getAnalyticsTrends);
router.get('/analytics/collections', getCollectionAnalytics);
router.get('/analytics/:id', getProductAnalytics);

export default router;

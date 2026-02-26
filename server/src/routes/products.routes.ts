/**
 * Products routes.
 *
 * Mounts Express handlers for product CRUD, inventory sync, and bulk Shopify
 * sync. All routes require authentication; write operations additionally
 * require the `write:campaigns` permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import { createProductSchema, idParamSchema } from '../validators/schemas';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  syncInventory,
  bulkSync,
} from '../controllers/products.controller';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// ---- Read operations ----
router.get('/', listProducts);
router.get('/:id', getProduct);

// ---- Write operations (require write:campaigns permission) ----
router.post('/', requirePermission('write:campaigns'), validateBody(createProductSchema), createProduct);
router.put('/:id', requirePermission('write:campaigns'), validateParams(idParamSchema), updateProduct);
router.delete('/:id', requirePermission('write:campaigns'), validateParams(idParamSchema), deleteProduct);
router.patch('/:id/inventory', requirePermission('write:campaigns'), validateParams(idParamSchema), syncInventory);
router.post('/sync', requirePermission('write:campaigns'), bulkSync);

export default router;

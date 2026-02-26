/**
 * Budget routes.
 *
 * Mounts Express handlers for budget allocation CRUD, spend recording,
 * summary aggregations, and guardrail checks. All routes require
 * authentication; write operations additionally require the `write:budget`
 * permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import {
  createBudgetAllocationSchema,
  recordSpendSchema,
  idParamSchema,
} from '../validators/schemas';
import {
  listAllocations,
  getAllocation,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  recordSpend,
  getSpendByCountry,
  getSpendByChannel,
  checkGuardrails,
} from '../controllers/budget.controller';

const router = Router();

// All budget routes require authentication
router.use(authenticate);

// ---- Summary endpoints (must be registered before /:id to avoid conflicts) ----
router.get('/summary/country', getSpendByCountry);
router.get('/summary/channel', getSpendByChannel);

// ---- Read operations ----
router.get('/', listAllocations);
router.get('/:id', getAllocation);
router.get('/:id/guardrails', checkGuardrails);

// ---- Write operations (require write:budget permission) ----
router.post('/', requirePermission('write:budget'), validateBody(createBudgetAllocationSchema), createAllocation);
router.put('/:id', requirePermission('write:budget'), validateParams(idParamSchema), validateBody(createBudgetAllocationSchema.partial()), updateAllocation);
router.delete('/:id', requirePermission('write:budget'), validateParams(idParamSchema), deleteAllocation);
router.post('/:id/spend', requirePermission('write:budget'), validateParams(idParamSchema), validateBody(recordSpendSchema), recordSpend);

export default router;

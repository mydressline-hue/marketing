/**
 * Final Outputs - Channel Allocation Routes.
 *
 * Defines Express routes for channel allocation matrix endpoints.
 * Phase 10 Final Output Deliverable #3.
 *
 *   GET /channel-allocation           - Full allocation matrix
 *   GET /channel-allocation/history   - Historical channel performance
 *   GET /channel-allocation/:countryCode - Per-country breakdown
 */

import { Router } from 'express';
import {
  getChannelAllocationMatrix,
  getCountryChannelAllocation,
  getChannelPerformanceHistory,
} from '../controllers/final-outputs-channels.controller';
import { authenticate } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// All channel allocation routes require authentication
router.use(authenticate);

// GET /channel-allocation - full matrix
router.get('/', getChannelAllocationMatrix);

// GET /channel-allocation/history - historical performance
// Must be registered before /:countryCode to avoid conflicts
router.get('/history', getChannelPerformanceHistory);

// GET /channel-allocation/:countryCode - per-country breakdown
router.get('/:countryCode', getCountryChannelAllocation);

export default router;

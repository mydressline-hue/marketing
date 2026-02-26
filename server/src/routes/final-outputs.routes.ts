/**
 * Final Outputs Route Aggregator.
 *
 * Phase 10 router for final output deliverables. Mounts dedicated route files
 * for each deliverable under the `/final-outputs` prefix via app.ts.
 *
 * Deliverable 10: Recommendations to Reach Enterprise Perfection
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import perfectionRoutes from './final-outputs-perfection.routes';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// Apply authentication to all final-outputs routes
router.use(authenticate);

// Mount dedicated Perfection Recommendations routes (Deliverable #10)
router.use('/', perfectionRoutes);

export default router;

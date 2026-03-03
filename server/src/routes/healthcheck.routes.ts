/**
 * Health Check routes.
 *
 * Mounts health check endpoints with a mix of public and authenticated
 * access. Public endpoints (simple, detailed, basic, readiness, liveness)
 * are designed for load balancers and Kubernetes probes. Authenticated
 * endpoints (deep health, historical data) require admin privileges
 * (write:infrastructure).
 *
 * This router is mounted at the `/health` prefix in app.ts, replacing the
 * original inline health check endpoint.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  simpleHealth,
  detailedHealth,
  basicHealth,
  deepHealth,
  readiness,
  liveness,
  historicalHealth,
} from '../controllers/healthcheck.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Public routes (no authentication required)
// ---------------------------------------------------------------------------

// GET /health -- simple health check for load balancers (returns just "ok")
router.get('/', simpleHealth);

// GET /health/details -- detailed health check (DB, Redis, memory, uptime)
// Returns HTTP 200 for healthy, HTTP 503 for unhealthy. No auth required.
router.get('/details', detailedHealth);

// GET /health/basic -- basic health check with version and uptime info
router.get('/basic', basicHealth);

// GET /health/ready -- readiness probe (public, for k8s)
router.get('/ready', readiness);

// GET /health/live -- liveness probe (public, for k8s)
router.get('/live', liveness);

// ---------------------------------------------------------------------------
// Authenticated routes (admin only)
// ---------------------------------------------------------------------------

// GET /health/deep -- deep health check (write:infrastructure)
router.get(
  '/deep',
  authenticate,
  requirePermission('write:infrastructure'),
  deepHealth,
);

// GET /health/history -- historical health data (write:infrastructure)
router.get(
  '/history',
  authenticate,
  requirePermission('write:infrastructure'),
  historicalHealth,
);

export default router;

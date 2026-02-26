/**
 * Health Check controllers -- Express request handlers.
 *
 * Provides public endpoints for basic health, readiness, and liveness
 * probes (suitable for load balancers and Kubernetes), as well as
 * authenticated admin endpoints for deep health checks and historical
 * health data.
 *
 * Handlers delegate to HealthCheckService and return structured JSON
 * envelopes: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { HealthCheckService } from '../services/healthcheck/HealthCheckService';

// ===========================================================================
// Public Handlers (no authentication required)
// ===========================================================================

/**
 * GET /health
 * Basic health check -- lightweight status for load balancers.
 */
export const basicHealth = asyncHandler(async (_req: Request, res: Response) => {
  const result = HealthCheckService.checkBasic();

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/ready
 * Readiness probe -- checks whether PostgreSQL and Redis are available.
 * Returns 503 if the service is not ready to accept traffic.
 */
export const readiness = asyncHandler(async (_req: Request, res: Response) => {
  const result = await HealthCheckService.checkReadiness();

  const statusCode = result.ready ? 200 : 503;

  res.status(statusCode).json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/live
 * Liveness probe -- confirms the process is alive and responding.
 */
export const liveness = asyncHandler(async (_req: Request, res: Response) => {
  const result = HealthCheckService.checkLiveness();

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Authenticated Handlers (admin only)
// ===========================================================================

/**
 * GET /health/deep
 * Deep health check -- comprehensive status of all subsystems including
 * PostgreSQL, Redis, integrations, memory, and disk.
 */
export const deepHealth = asyncHandler(async (_req: Request, res: Response) => {
  const result = await HealthCheckService.checkDeep();

  const statusCode = result.status === 'unhealthy' ? 503 : 200;

  res.status(statusCode).json({
    success: true,
    data: result,
  });
});

/**
 * GET /health/history
 * Historical health data -- returns health snapshots from the last N hours.
 * Query parameter: `hours` (default: 24).
 */
export const historicalHealth = asyncHandler(async (req: Request, res: Response) => {
  const { hours } = req.query;

  const hoursNum = hours ? parseInt(hours as string, 10) : 24;

  const result = await HealthCheckService.getHistoricalHealth(
    isNaN(hoursNum) ? 24 : hoursNum,
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Prometheus Metrics Route.
 *
 * Exposes a GET /metrics endpoint that returns all application metrics in
 * the Prometheus text exposition format (text/plain; version=0.0.4).
 *
 * This route is intentionally unauthenticated so that Prometheus scrapers
 * can reach it without needing a JWT. In production, access should be
 * restricted at the network/ingress level (e.g. internal-only service mesh
 * or firewall rules).
 */

import { Router, Request, Response } from 'express';
import { renderMetrics } from '../services/observability/metrics';
import { env } from '../config/env';

const router = Router();

/**
 * GET /metrics
 *
 * Returns Prometheus-compatible metrics in text format.
 * Responds with 503 if metrics collection is disabled.
 */
router.get('/', (_req: Request, res: Response) => {
  if (!env.METRICS_ENABLED) {
    res.status(503).json({
      error: 'Metrics collection is disabled',
    });
    return;
  }

  const body = renderMetrics();
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(body);
});

export default router;

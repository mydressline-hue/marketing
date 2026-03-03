/**
 * Node.js Cluster Mode Entry Point.
 *
 * When executed as the primary process, this module forks the configured
 * number of worker processes, each of which runs the standard server
 * startup logic from `./index.ts`.
 *
 * Usage:
 *   CLUSTER_ENABLED=true node dist/cluster.js
 *
 * Environment variables:
 *   CLUSTER_ENABLED  – boolean, must be true to use cluster mode (default: false)
 *   CLUSTER_WORKERS  – number of workers to fork (default: os.cpus().length, max 8)
 */

import cluster from 'node:cluster';
import os from 'node:os';
import { env } from './config/env';
import { logger } from './utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute upper bound on worker count to prevent resource exhaustion. */
const MAX_WORKERS = 8;

/** Delay (ms) before restarting a crashed worker to avoid fork-bomb loops. */
const RESTART_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Determine worker count
// ---------------------------------------------------------------------------

function getWorkerCount(): number {
  const cpuCount = os.cpus().length;
  const requested = env.CLUSTER_WORKERS > 0 ? env.CLUSTER_WORKERS : cpuCount;
  return Math.min(requested, MAX_WORKERS);
}

// ---------------------------------------------------------------------------
// Primary process
// ---------------------------------------------------------------------------

function runPrimary(): void {
  const workerCount = getWorkerCount();

  logger.info(
    `Cluster primary (pid ${process.pid}) starting ${workerCount} worker(s)`,
  );

  // Fork workers
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Track whether we are in the process of shutting down so that we do not
  // respawn workers that exit as part of a graceful shutdown.
  let isShuttingDown = false;

  // ── Worker exit handling ────────────────────────────────────────────
  cluster.on('exit', (worker, code, signal) => {
    if (isShuttingDown) {
      logger.info(
        `Worker ${worker.process.pid} exited during shutdown (code=${code}, signal=${signal})`,
      );
      return;
    }

    logger.warn(
      `Worker ${worker.process.pid} died (code=${code}, signal=${signal}). ` +
        `Restarting in ${RESTART_DELAY_MS}ms...`,
    );

    setTimeout(() => {
      if (!isShuttingDown) {
        cluster.fork();
      }
    }, RESTART_DELAY_MS);
  });

  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(
      `Cluster primary received ${signal}. Shutting down all workers...`,
    );

    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.process.kill('SIGTERM');
      }
    }

    // Give workers time to finish, then force-exit the primary.
    // Each worker already has its own graceful-shutdown timeout, so this
    // outer timeout is a last-resort safety net.
    const FORCE_EXIT_MS = 30_000;
    setTimeout(() => {
      logger.error('Cluster primary: forced exit after timeout');
      process.exit(1);
    }, FORCE_EXIT_MS).unref();

    // When all workers have exited, exit the primary cleanly.
    const checkAllExited = () => {
      const remaining = Object.keys(cluster.workers ?? {}).length;
      if (remaining === 0) {
        logger.info('All workers exited. Primary shutting down.');
        process.exit(0);
      }
    };

    cluster.on('exit', checkAllExited);
    // Run once immediately in case there are already zero workers.
    checkAllExited();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ---------------------------------------------------------------------------
// Worker process
// ---------------------------------------------------------------------------

async function runWorker(): Promise<void> {
  logger.info(`Cluster worker starting (pid ${process.pid})`);

  // Re-use the existing server bootstrap. The `startServer` function
  // initialises database/Redis connections, starts the HTTP & WebSocket
  // servers, and registers its own SIGTERM / SIGINT handlers for graceful
  // shutdown.
  const { startServer } = await import('./index');
  await startServer();
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

if (!env.CLUSTER_ENABLED) {
  // Clustering is not enabled — fall back to single-process mode.
  // This makes `node dist/cluster.js` behave identically to
  // `node dist/index.js` when CLUSTER_ENABLED is false.
  logger.info('CLUSTER_ENABLED is false. Starting in single-process mode.');
  import('./index').then(({ startServer }) => startServer());
} else if (cluster.isPrimary) {
  runPrimary();
} else {
  runWorker();
}

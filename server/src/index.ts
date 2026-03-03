import { env } from './config/env';
import { logger } from './utils/logger';
import { initializeConnections, closeConnections } from './config';
import { getConfig } from './config/production';
import app from './app';
import { MarketingWebSocketServer } from './websocket';

/**
 * Start the HTTP server, WebSocket server, and wire up graceful shutdown.
 *
 * Extracted into a named export so the cluster primary can import and invoke
 * it inside each worker process without duplicating the bootstrap logic.
 */
export async function startServer(): Promise<void> {
  try {
    // Initialize database and Redis connections
    await initializeConnections();

    const config = getConfig();
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`API prefix: ${env.API_PREFIX}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`Shutdown timeout: ${config.server.gracefulShutdownTimeoutMs}ms`);
    });

    const wsServer = new MarketingWebSocketServer(server);

    // ------------------------------------------------------------------
    // Graceful shutdown
    // ------------------------------------------------------------------
    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      const timeoutMs = config.server.gracefulShutdownTimeoutMs;
      logger.info(`Received ${signal}. Starting graceful shutdown (timeout: ${timeoutMs}ms)...`);

      // 1. Force-exit safety net (unref so it won't keep the process alive)
      const forceTimer = setTimeout(() => {
        logger.error(`Forced shutdown after ${timeoutMs}ms timeout`);
        process.exit(1);
      }, timeoutMs);
      forceTimer.unref();

      try {
        // 2. Stop accepting new HTTP connections
        logger.info('Shutdown: closing HTTP server (stop accepting new connections)...');
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              logger.error('Shutdown: error closing HTTP server', { error: err.message });
              reject(err);
            } else {
              logger.info('Shutdown: HTTP server closed');
              resolve();
            }
          });
        });

        // 3. Close WebSocket server
        logger.info('Shutdown: closing WebSocket server...');
        wsServer.close();
        logger.info('Shutdown: WebSocket server closed');

        // 4. Close database pool, Redis connections, and EventBus
        //    (closeConnections handles eventBus.close(), closePool(), closeRedis())
        logger.info('Shutdown: closing database pool, Redis, and EventBus connections...');
        await closeConnections();
        logger.info('Shutdown: all connections closed');

        logger.info('Server shut down gracefully');
        process.exit(0);
      } catch (err) {
        logger.error('Error during graceful shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Global error handlers to prevent unhandled crashes
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Auto-start when this file is the direct entry point (e.g. `node dist/index.js`).
// When imported by cluster.ts workers, the caller is responsible for invoking
// startServer() explicitly, so we guard with a require.main check.
if (require.main === module) {
  startServer();
}

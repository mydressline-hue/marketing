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
    });

    const wsServer = new MarketingWebSocketServer(server);

    // Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      wsServer.close();
      server.close(async () => {
        try {
          await closeConnections();
          logger.info('Server shut down gracefully');
          process.exit(0);
        } catch (err) {
          logger.error('Error during connection cleanup:', err);
          process.exit(1);
        }
      });

      // Force shutdown after configured timeout (unref so it doesn't keep process alive)
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, config.server.gracefulShutdownTimeoutMs).unref();
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

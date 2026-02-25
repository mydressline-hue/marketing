import { env } from './config/env';
import { logger } from './utils/logger';
import { initializeConnections, closeConnections } from './config';
import app from './app';

async function main(): Promise<void> {
  try {
    // Initialize database and Redis connections
    await initializeConnections();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`API prefix: ${env.API_PREFIX}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        await closeConnections();
        logger.info('Server shut down gracefully');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

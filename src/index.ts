import 'reflect-metadata';
import http from 'node:http';
import { AppDataSource } from '@config/data-source';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { redis } from '@config/redis';
import { createTerminus } from '@godaddy/terminus';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

/** Rejects if `promise` does not settle within `ms` — keeps health checks bounded. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} health check timed out`)), ms),
    ),
  ]);
}

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  // Register the initialized DataSource in TypeDI so repositories can inject it.
  Container.set(DataSource, AppDataSource);
  logger.info('Database connected');

  const app = createServer();
  const server = http.createServer(app);

  createTerminus(server, {
    signals: ['SIGINT', 'SIGTERM'],
    healthChecks: {
      // Readiness: dependencies must be reachable (returns 503 otherwise).
      '/health': async () => {
        await withTimeout(AppDataSource.query('SELECT 1'), 2000, 'database');
        await withTimeout(redis.ping(), 1000, 'redis');
        return { database: 'up', redis: 'up' };
      },
      // Liveness: process is up (no dependency checks).
      '/health/live': async () => ({ status: 'ok' }),
      verbatim: true,
    },
    // Graceful shutdown: close DB + Redis before the process exits.
    onSignal: async () => {
      logger.info('Shutdown signal received — releasing resources');
      await AppDataSource.destroy();
      await redis.quit();
    },
    onShutdown: async () => {
      logger.info('Cleanup finished, process exiting');
    },
    logger: (msg, err) => logger.error(`${msg} ${err?.message ?? ''}`),
  });

  server.listen(env.PORT, () => {
    logger.info(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

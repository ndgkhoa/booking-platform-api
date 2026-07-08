import '@config/tracing';
import 'reflect-metadata';
import http from 'node:http';
import { withTimeout } from '@common/utils/timeout';
import { AppDataSource } from '@config/data-source';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { redis } from '@config/redis';
import { createTerminus } from '@godaddy/terminus';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  Container.set(DataSource, AppDataSource);
  logger.info('Database connected');

  const app = createServer();
  const server = http.createServer(app);

  createTerminus(server, {
    signals: ['SIGINT', 'SIGTERM'],
    healthChecks: {
      '/health/live': async () => ({ status: 'ok' }),
      '/health/ready': async () => {
        await withTimeout(AppDataSource.query('SELECT 1'), 2000, 'database');
        await withTimeout(redis.ping(), 1000, 'redis');
        return { status: 'ready' };
      },
      verbatim: true,
    },
    onSignal: async () => {
      logger.info('Shutdown signal received — releasing resources');
      await AppDataSource.destroy();
      await redis.quit();
    },
    onShutdown: async () => {
      logger.info('Cleanup finished, process exiting');
    },
    logger: (msg, err) => logger.error(err ? `${msg}: ${err.message}` : msg),
  });

  server.listen(env.PORT, () => {
    logger.info(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

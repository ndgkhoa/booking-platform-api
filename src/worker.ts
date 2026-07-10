import '@config/tracing';
import 'reflect-metadata';
import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { redis } from '@config/redis';
import { startEmailWorker } from '@jobs/workers/email.worker';
import { startOutboxRelay } from '@jobs/workers/outbox-relay.worker';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  Container.set(DataSource, AppDataSource);
  logger.info('Worker database connected');

  const emailWorker = startEmailWorker();
  const stopRelay = startOutboxRelay();
  logger.info('Workers started');

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — closing workers`);
    stopRelay();
    await emailWorker.close();
    await AppDataSource.destroy();
    await redis.quit();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

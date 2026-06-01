import 'reflect-metadata';
import { logger } from '@config/logger';
import { redis } from '@config/redis';
import { startEmailWorker } from '@jobs/workers/email.worker';

const workers = [startEmailWorker()];
logger.info('Workers started');

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — closing workers`);
  await Promise.all(workers.map((w) => w.close()));
  await redis.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

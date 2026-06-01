import { logger } from '@config/logger';
import { redisConnectionOptions } from '@config/redis';
import { EMAIL_QUEUE, type WelcomeEmailJob } from '@jobs/queues/email.queue';
import { type Job, Worker } from 'bullmq';

export function startEmailWorker(): Worker<WelcomeEmailJob> {
  const worker = new Worker<WelcomeEmailJob>(
    EMAIL_QUEUE,
    async (job: Job<WelcomeEmailJob>) => {
      logger.info(`Sending welcome email to ${job.data.email} (job ${job.id})`);
      // TODO: integrate a real email provider here.
    },
    { connection: redisConnectionOptions, concurrency: 5 },
  );

  worker.on('completed', (job) => logger.info(`Email job ${job.id} completed`));
  worker.on('failed', (job, err) => logger.error(`Email job ${job?.id} failed: ${err.message}`));

  return worker;
}

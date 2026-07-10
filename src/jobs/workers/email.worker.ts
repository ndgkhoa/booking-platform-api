import { logger } from '@config/logger';
import { redisConnectionOptions } from '@config/redis';
import { EMAIL_QUEUE, type EmailJob } from '@jobs/queues/email.queue';
import { type Job, Worker } from 'bullmq';

export function startEmailWorker(): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job: Job<EmailJob>) => {
      logger.info(`Sending ${describe(job.data)} (job ${job.id})`);
      // TODO: integrate a real email provider here.
    },
    { connection: redisConnectionOptions, concurrency: 5 },
  );

  worker.on('completed', (job) => logger.info(`Email job ${job.id} completed`));
  worker.on('failed', (job, err) => logger.error(`Email job ${job?.id} failed: ${err.message}`));

  return worker;
}

function describe(data: EmailJob): string {
  switch (data.type) {
    case 'invite':
      return `invite to ${data.email} for ${data.tenantName} (${data.role})`;
    case 'booking':
      return `${data.eventType} notification for booking ${data.bookingId}`;
    default:
      return `welcome email to ${data.email}`;
  }
}

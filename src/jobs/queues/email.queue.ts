import { redisConnectionOptions } from '@config/redis';
import { Queue } from 'bullmq';

/** Payload for a welcome-email job. */
export interface WelcomeEmailJob {
  userId: string;
  email: string;
}

export const EMAIL_QUEUE = 'email';

/** BullMQ queue for outbound email jobs (manages its own Redis connection). */
export const emailQueue = new Queue<WelcomeEmailJob>(EMAIL_QUEUE, {
  connection: redisConnectionOptions,
});

/** Enqueues a welcome email with retry + exponential backoff. */
export function enqueueWelcomeEmail(data: WelcomeEmailJob) {
  return emailQueue.add('welcome', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

import { redisConnectionOptions } from '@config/redis';
import { Queue } from 'bullmq';

export interface WelcomeEmailJob {
  userId: string;
  email: string;
}

export const EMAIL_QUEUE = 'email';

export const emailQueue = new Queue<WelcomeEmailJob>(EMAIL_QUEUE, {
  connection: redisConnectionOptions,
});

export function enqueueWelcomeEmail(data: WelcomeEmailJob) {
  return emailQueue.add('welcome', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

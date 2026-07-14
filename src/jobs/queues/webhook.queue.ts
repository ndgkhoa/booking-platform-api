import { redisConnectionOptions } from '@config/redis';
import { Queue } from 'bullmq';

export interface WebhookJob {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  data: Record<string, unknown>;
}

export const WEBHOOK_QUEUE = 'webhook';

export const webhookQueue = new Queue<WebhookJob>(WEBHOOK_QUEUE, {
  connection: redisConnectionOptions,
});

export function enqueueWebhook(data: WebhookJob, jobId?: string) {
  return webhookQueue.add('deliver', data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: 500,
    jobId,
  });
}

import { runInTenantContext } from '@common/tenant/tenant-transaction';
import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { redisConnectionOptions } from '@config/redis';
import { WEBHOOK_QUEUE, type WebhookJob } from '@jobs/queues/webhook.queue';
import { WebhookService } from '@modules/webhook/webhook.service';
import { type Job, Worker } from 'bullmq';
import { Container } from 'typedi';

/**
 * Delivers webhook jobs. Reads the tenant's endpoint inside its tenant context
 * (RLS-scoped), then POSTs the signed payload. A non-2xx / error throws so BullMQ
 * retries with backoff and eventually dead-letters.
 */
export function startWebhookWorker(): Worker<WebhookJob> {
  const webhooks = Container.get(WebhookService);

  const worker = new Worker<WebhookJob>(
    WEBHOOK_QUEUE,
    async (job: Job<WebhookJob>) => {
      const { tenantId, eventType, aggregateType, aggregateId, data } = job.data;
      const endpoint = await runInTenantContext(AppDataSource, tenantId, () =>
        webhooks.activeEndpoint(),
      );
      if (!endpoint) {
        return; // tenant removed its webhook after the event was queued
      }
      await webhooks.deliver(endpoint.url, endpoint.secret, {
        eventType,
        aggregateType,
        aggregateId,
        data,
      });
    },
    { connection: redisConnectionOptions, concurrency: 5 },
  );

  worker.on('failed', (job, err) => logger.warn(`Webhook job ${job?.id} failed: ${err.message}`));
  return worker;
}

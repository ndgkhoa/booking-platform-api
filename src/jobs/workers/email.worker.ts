import { NotFoundException } from '@common/exceptions';
import { runInTenantContext } from '@common/tenant/tenant-transaction';
import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { redisConnectionOptions } from '@config/redis';
import { EMAIL_QUEUE, type EmailJob } from '@jobs/queues/email.queue';
import { CustomerService } from '@modules/customer/customer.service';
import { MailService } from '@modules/mail/mail.service';
import { renderEmail } from '@modules/mail/mail-content';
import { type Job, Worker } from 'bullmq';
import { Container } from 'typedi';

/**
 * Recipient address. Welcome/invite jobs carry it; a booking job carries only the
 * customer id, so we look their email up under the tenant's RLS scope. A missing
 * customer yields null (skip); other errors bubble so BullMQ retries.
 */
async function resolveRecipient(job: EmailJob): Promise<string | null> {
  if (job.type !== 'booking') {
    return job.email;
  }
  try {
    return await runInTenantContext(AppDataSource, job.tenantId, async () => {
      const customer = await Container.get(CustomerService).getById(job.customerId);
      return customer.email;
    });
  } catch (error) {
    if (error instanceof NotFoundException) {
      return null;
    }
    throw error;
  }
}

/**
 * Delivers queued emails via Resend. At-least-once with an idempotent jobId, so a
 * redelivery of the same event is a no-op; a provider error throws to retry.
 */
export function startEmailWorker(): Worker<EmailJob> {
  const mail = Container.get(MailService);

  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job: Job<EmailJob>) => {
      const to = await resolveRecipient(job.data);
      if (!to) {
        logger.warn(`Email job ${job.id} has no recipient — skipped`);
        return;
      }
      const { subject, html } = renderEmail(job.data);
      await mail.send({ to, subject, html });
      logger.info(`Email delivered: "${subject}" -> ${to} (job ${job.id})`);
    },
    { connection: redisConnectionOptions, concurrency: 5 },
  );

  worker.on('failed', (job, err) => logger.error(`Email job ${job?.id} failed: ${err.message}`));
  return worker;
}

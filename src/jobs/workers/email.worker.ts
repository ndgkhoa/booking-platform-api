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

// Welcome/invite jobs carry the recipient; booking jobs carry only a customer id, so we
// look it up under the tenant's RLS scope — a missing customer yields null (skip).
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

// At-least-once delivery with an idempotent jobId, so redelivery of the same event is a
// no-op; a provider error throws to retry.
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

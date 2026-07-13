import { OUTBOX_POLL_INTERVAL_MS } from '@common/constants';
import { outboxOldestPendingSeconds, outboxPending } from '@common/monitoring/metrics';
import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { enqueueBookingEmail } from '@jobs/queues/email.queue';
import { enqueueWebhook } from '@jobs/queues/webhook.queue';
import { OutboxRepository } from '@modules/outbox/outbox.repository';
import type { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { OutboxRelayService } from '@modules/outbox/outbox-relay.service';
import { Container } from 'typedi';

/**
 * Maps a committed outbox event to queued side effects (at-least-once). jobId is
 * derived from the event id so a redelivery enqueues the same job once. Webhook
 * jobs are always enqueued; the worker no-ops if the tenant has no endpoint.
 */
async function dispatch(event: OutboxEvent): Promise<void> {
  if (event.aggregateType !== 'booking') {
    return;
  }
  await enqueueBookingEmail(
    {
      eventType: event.eventType,
      tenantId: event.tenantId,
      bookingId: String(event.payload.bookingId),
      customerId: String(event.payload.customerId),
    },
    `email:${event.id}`,
  );
  await enqueueWebhook(
    {
      tenantId: event.tenantId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      data: event.payload,
    },
    `webhook:${event.id}`,
  );
}

/** Starts the outbox poller; returns an async stop that drains the in-flight tick. */
export function startOutboxRelay(): () => Promise<void> {
  const relay = Container.get(OutboxRelayService);
  const outbox = Container.get(OutboxRepository);
  let inFlight: Promise<void> | null = null;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (inFlight || stopped) return;
    inFlight = (async () => {
      try {
        let processed: number;
        do {
          processed = await relay.processBatch(dispatch);
        } while (processed > 0 && !stopped);
        const backlog = await outbox.backlogStats(AppDataSource.manager);
        outboxPending.set(backlog.pending);
        outboxOldestPendingSeconds.set(backlog.oldestAgeSeconds);
      } catch (error) {
        logger.error(`Outbox relay tick failed: ${(error as Error).message}`);
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
  };

  const timer = setInterval(() => void tick(), OUTBOX_POLL_INTERVAL_MS);
  logger.info('Outbox relay started');

  // Stop accepting new work and let any running tick finish before the caller
  // tears down the DataSource, so no live transaction is aborted mid-flight.
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (inFlight) await inFlight;
  };
}

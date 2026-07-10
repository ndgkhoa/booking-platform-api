import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { enqueueBookingEmail } from '@jobs/queues/email.queue';
import type { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { OutboxRelay } from '@modules/outbox/outbox-relay.service';
import { Container } from 'typedi';

const POLL_INTERVAL_MS = 2_000;

/** Maps a committed outbox event to a queued side effect (at-least-once). */
async function dispatch(event: OutboxEvent): Promise<void> {
  if (event.aggregateType === 'booking') {
    await enqueueBookingEmail({
      eventType: event.eventType,
      tenantId: event.tenantId,
      bookingId: String(event.payload.bookingId),
      customerId: String(event.payload.customerId),
    });
  }
}

/** Starts the outbox poller; returns a stop function for graceful shutdown. */
export function startOutboxRelay(): () => void {
  const relay = Container.get(OutboxRelay);
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      let processed: number;
      do {
        processed = await relay.processBatch(AppDataSource, dispatch);
      } while (processed > 0);
    } catch (error) {
      logger.error(`Outbox relay tick failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info('Outbox relay started');
  return () => clearInterval(timer);
}

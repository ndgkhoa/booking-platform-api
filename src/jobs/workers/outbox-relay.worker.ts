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
    await enqueueBookingEmail(
      {
        eventType: event.eventType,
        tenantId: event.tenantId,
        bookingId: String(event.payload.bookingId),
        customerId: String(event.payload.customerId),
      },
      event.id, // dedupe key: a redelivered event enqueues the same job once
    );
  }
}

/** Starts the outbox poller; returns an async stop that drains the in-flight tick. */
export function startOutboxRelay(): () => Promise<void> {
  const relay = Container.get(OutboxRelay);
  let inFlight: Promise<void> | null = null;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (inFlight || stopped) return;
    inFlight = (async () => {
      try {
        let processed: number;
        do {
          processed = await relay.processBatch(AppDataSource, dispatch);
        } while (processed > 0 && !stopped);
      } catch (error) {
        logger.error(`Outbox relay tick failed: ${(error as Error).message}`);
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
  };

  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info('Outbox relay started');

  // Stop accepting new work and let any running tick finish before the caller
  // tears down the DataSource, so no live transaction is aborted mid-flight.
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (inFlight) await inFlight;
  };
}

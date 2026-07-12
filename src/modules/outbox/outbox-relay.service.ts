import { OUTBOX_BATCH_SIZE } from '@common/constants';
import { outboxDispatched } from '@common/monitoring/metrics';
import { logger } from '@config/logger';
import { OutboxRepository } from '@modules/outbox/outbox.repository';
import type { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/** Delivers one event (e.g. enqueue to BullMQ). Injected so the relay stays I/O-agnostic and testable. */
export type OutboxDispatch = (event: OutboxEvent) => Promise<void>;

/**
 * Drains committed outbox events and hands each to `dispatch`. Claiming and
 * status updates run in one transaction with `FOR UPDATE SKIP LOCKED`, so many
 * relay instances can run concurrently without double-claiming. Delivery is
 * at-least-once — a crash after dispatch but before commit re-delivers, so
 * consumers must be idempotent.
 */
@Service()
export class OutboxRelay {
  constructor(private readonly outbox: OutboxRepository) {}

  async processBatch(
    dataSource: DataSource,
    dispatch: OutboxDispatch,
    batchSize = OUTBOX_BATCH_SIZE,
  ): Promise<number> {
    return dataSource.transaction(async (manager) => {
      const events = await this.outbox.claimBatch(manager, batchSize);
      let dispatched = 0;
      for (const event of events) {
        try {
          await dispatch(event);
          await this.outbox.markDispatched(manager, event.id);
          outboxDispatched.inc({ result: 'success' });
          dispatched += 1;
        } catch (error) {
          logger.warn(`Outbox dispatch failed for ${event.id}: ${(error as Error).message}`);
          await this.outbox.markFailed(manager, event);
          outboxDispatched.inc({ result: 'failure' });
        }
      }
      return dispatched;
    });
  }
}
